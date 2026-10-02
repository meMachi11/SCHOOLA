import { env } from "cloudflare:workers";
import { db, sameOrigin } from "../server";
import { type User, type Role, userSchema, passwordSchema } from "./model";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Runtime = {
  SCOLA_OWNER_EMAIL?: string;
  SCOLA_INITIAL_ADMIN_EMAILS?: string;
  SCOLA_DEMO_DATA?: string;
  SCOLA_DEMO_LOGIN_HASHES?: string;
  SCOLA_ORIGIN?: string;
  EMAIL_PROVIDER?: string;
  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;
  MAILGUN_DOMAIN?: string;
};
export const runtime = () => env as typeof env & Runtime;
export const now = () => new Date().toISOString();
export const bytes = (v: string) => new TextEncoder().encode(v);
export function encode(v: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(v)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
export function decode(v: string) {
  return Uint8Array.from(atob(v.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
    c.charCodeAt(0),
  );
}
export const randomToken = () =>
  encode(crypto.getRandomValues(new Uint8Array(32)));
export const hash = async (v: string) =>
  encode(await crypto.subtle.digest("SHA-256", bytes(v)));
export async function passwordHash(
  password: string,
  salt = encode(crypto.getRandomValues(new Uint8Array(16))),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    bytes(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const result = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: bytes(salt), iterations: 100000 },
    key,
    256,
  );
  return `pbkdf2:100000:${salt}:${encode(result)}`;
}
export async function passwordMatches(password: string, stored: string) {
  const [, , salt] = stored.split(":");
  if (!salt) return false;
  const candidate = await passwordHash(password, salt);
  let difference = candidate.length ^ stored.length;
  for (let i = 0; i < Math.max(candidate.length, stored.length); i++)
    difference |= (candidate.charCodeAt(i) || 0) ^ (stored.charCodeAt(i) || 0);
  return difference === 0;
}
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  class_ids: string;
  student_ids: string;
  active: number;
  identity_id: string | null;
  password_hash: string | null;
};
export const userFrom = (r: UserRow): User => ({
  id: r.id,
  name: r.name,
  email: r.email,
  role: r.role,
  classIds: JSON.parse(r.class_ids),
  studentIds: JSON.parse(r.student_ids),
  active: !!r.active,
  identityId: r.identity_id ?? undefined,
});
export async function audit(actorId: string, action: string, target: string) {
  await db()
    .prepare(
      "INSERT INTO school_audit (id,actor_id,action,target,created) VALUES (?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actorId, action, target, now())
    .run();
}
export async function rateLimit(key: string, limit: number, seconds = 900) {
  const instant = now();
  const expires = new Date(Date.now() + seconds * 1000).toISOString();
  const r = await db()
    .prepare(
      "INSERT INTO school_rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count",
    )
    .bind(key, expires, instant, instant)
    .first<{ count: number }>();
  if (!r || r.count > limit)
    throw new ApiError(429, "Trop de tentatives. Réessayez plus tard.");
}
export async function currentUser(req: Request): Promise<User | null> {
  const authorization = req.headers.get("authorization");
  const cookie = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)scola_session=([A-Za-z0-9_-]+)/)?.[1];
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : cookie;
  if (token) {
    const r = await db()
      .prepare(
        "SELECT u.* FROM school_users u JOIN school_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires>? AND u.active=1",
      )
      .bind(await hash(token), now())
      .first<UserRow>();
    if (r) return userFrom(r);
  }
  const identityId = req.headers.get("oai-authenticated-user-id");
  const email = req.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!identityId || !email) return null;
  let r = await db()
    .prepare("SELECT * FROM school_users WHERE identity_id=?")
    .bind(identityId)
    .first<UserRow>();
  if (!r) {
    r = await db()
      .prepare("SELECT * FROM school_users WHERE email=?")
      .bind(email)
      .first<UserRow>();
    const initialAdmins = [
      runtime().SCOLA_OWNER_EMAIL ?? "",
      ...(runtime().SCOLA_INITIAL_ADMIN_EMAILS ?? "").split(","),
    ]
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (!r && initialAdmins.includes(email)) {
      const created = await db()
        .prepare(
          "INSERT OR IGNORE INTO school_users (id,email,name,role,identity_id,created) VALUES (?,?,?,'admin',?,?)",
        )
        .bind(
          crypto.randomUUID(),
          email,
          email.split("@")[0],
          identityId,
          now(),
        )
        .run();
      r = await db()
        .prepare("SELECT * FROM school_users WHERE email=?")
        .bind(email)
        .first<UserRow>();
      if (created.meta.changes && r) await audit(r.id, "admin.bootstrap", r.id);
    }
    if (r && !r.identity_id) {
      await db()
        .prepare(
          "UPDATE school_users SET identity_id=? WHERE id=? AND identity_id IS NULL",
        )
        .bind(identityId, r.id)
        .run();
      r.identity_id = identityId;
    }
  }
  if (!r?.active || r.identity_id !== identityId) return null;
  return userFrom(r);
}
export async function requireUser(req: Request, allowed?: Role[]) {
  const u = await currentUser(req);
  if (!u) throw new ApiError(401, "Connectez-vous avec un compte autorisé.");
  if (allowed && !allowed.includes(u.role))
    throw new ApiError(403, "Accès non autorisé.");
  return u;
}
export function checkOrigin(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "Origine non autorisée.");
  try {
    sameOrigin(req);
  } catch {
    throw new ApiError(403, "Origine non autorisée.");
  }
}
export async function body(req: Request) {
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) {
          await reader.cancel();
          throw new ApiError(413, "Requête trop volumineuse.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  const payload = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    payload.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(payload);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ApiError(400, "JSON invalide.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ApiError(400, "Objet JSON requis.");
  return value as Record<string, unknown>;
}
export function responseError(e: unknown) {
  if (e instanceof ApiError)
    return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json(
    { error: "Service indisponible. Réessayez." },
    { status: 503 },
  );
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function sessionCookie(req: Request, token: string, maxAge = 604800) {
  return `scola_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
export async function session(req: Request, user: User) {
  const token = randomToken();
  await db()
    .prepare(
      "INSERT INTO school_sessions (token_hash,user_id,expires,created) VALUES (?,?,?,?)",
    )
    .bind(
      await hash(token),
      user.id,
      new Date(Date.now() + 604800000).toISOString(),
      now(),
    )
    .run();
  await audit(user.id, "login", user.id);
  const r = json({ user, token });
  r.headers.set("Set-Cookie", sessionCookie(req, token));
  return r;
}
export async function saveUser(actor: User, input: Record<string, unknown>) {
  const parsed = userSchema.safeParse(input.data);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
  if (parsed.data.role === "student" && parsed.data.studentIds.length > 1)
    throw new ApiError(
      400,
      "Un compte élève doit être lié à un seul profil élève.",
    );
  const id = typeof input.id === "string" ? input.id : crypto.randomUUID();
  if (id === actor.id && (!parsed.data.active || parsed.data.role !== "admin"))
    throw new ApiError(
      400,
      "Vous ne pouvez pas retirer votre propre accès administrateur.",
    );
  const old = await db()
    .prepare("SELECT * FROM school_users WHERE id=?")
    .bind(id)
    .first<UserRow>();
  if (
    old?.role === "admin" &&
    (!parsed.data.active || parsed.data.role !== "admin")
  ) {
    const count = await db()
      .prepare(
        "SELECT count(*) AS n FROM school_users WHERE role='admin' AND active=1",
      )
      .first<{ n: number }>();
    if ((count?.n ?? 0) < 2)
      throw new ApiError(400, "Conservez un administrateur actif.");
  }
  if (
    old &&
    old.email === runtime().SCOLA_OWNER_EMAIL?.toLowerCase() &&
    (parsed.data.email !== old.email ||
      !parsed.data.active ||
      parsed.data.role !== "admin")
  )
    throw new ApiError(
      400,
      "Le propriétaire doit conserver son accès administrateur.",
    );
  const password =
    typeof input.password === "string" && input.password
      ? passwordSchema.parse(input.password)
      : null;
  if (!old && !password)
    throw new ApiError(
      400,
      "Définissez un mot de passe initial (12 caractères, lettres et chiffres).",
    );
  const v = parsed.data;
  await db()
    .prepare(
      "INSERT INTO school_users (id,email,name,role,class_ids,student_ids,active,password_hash,created) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,role=excluded.role,class_ids=excluded.class_ids,student_ids=excluded.student_ids,active=excluded.active,password_hash=COALESCE(excluded.password_hash,school_users.password_hash)",
    )
    .bind(
      id,
      v.email,
      v.name,
      v.role,
      JSON.stringify(v.classIds),
      JSON.stringify(v.studentIds),
      v.active ? 1 : 0,
      password ? await passwordHash(password) : null,
      now(),
    )
    .run();
  await db()
    .prepare("DELETE FROM school_sessions WHERE user_id=?")
    .bind(id)
    .run();
  await audit(actor.id, "user.save", id);
  return userFrom(
    (await db()
      .prepare("SELECT * FROM school_users WHERE id=?")
      .bind(id)
      .first<UserRow>())!,
  );
}
