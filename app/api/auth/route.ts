import { isDemoId } from "../../../lib/school/demo-marker";
import { activateDemoLogins } from "../../../lib/school/demo-logins";
import { db } from "../../../lib/server";
import {
  ApiError,
  audit,
  body,
  checkOrigin,
  currentUser,
  hash,
  json,
  now,
  passwordHash,
  passwordMatches,
  randomToken,
  rateLimit,
  requireUser,
  responseError,
  runtime,
  session,
  sessionCookie,
  userFrom,
  type UserRow,
} from "../../../lib/school/auth";
import { emailConfig, sendEmail } from "../../../lib/school/email";
import { passwordSchema } from "../../../lib/school/model";
export async function GET(req: Request) {
  try {
    await activateDemoLogins();
    return json({
      user: await currentUser(req),
      emailRecovery: !!(await emailConfig()),
    });
  } catch (e) {
    return responseError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const data = await body(req),
      action = data.action;
    if (action === "login") {
      await activateDemoLogins();
      const email = String(data.email ?? "")
        .toLowerCase()
        .trim();
      const password = String(data.password ?? "");
      if (email.length > 200 || password.length > 128)
        throw new ApiError(400, "Identifiants invalides.");
      await rateLimit(
        "login-ip:" +
          (await hash(req.headers.get("cf-connecting-ip") ?? "local")),
        60,
      );
      await rateLimit(
        "login:" +
          (await hash(
            email + ":" + (req.headers.get("cf-connecting-ip") ?? "local"),
          )),
        10,
      );
      const row = await db()
        .prepare("SELECT * FROM school_users WHERE email=?")
        .bind(email)
        .first<UserRow>();
      const valid = await passwordMatches(
        password,
        row?.password_hash ?? "pbkdf2:100000:dummy:invalid",
      );
      if (!row?.active || !valid) {
        await audit("anonymous", "login.failed", await hash(email));
        throw new ApiError(401, "Email ou mot de passe incorrect.");
      }
      return session(req, userFrom(row));
    }
    if (action === "logout") {
      const user = await currentUser(req);
      const token =
        req.headers.get("authorization")?.replace(/^Bearer /, "") ??
        req.headers
          .get("cookie")
          ?.match(/(?:^|;\s*)scola_session=([A-Za-z0-9_-]+)/)?.[1];
      if (token)
        await db()
          .prepare("DELETE FROM school_sessions WHERE token_hash=?")
          .bind(await hash(token))
          .run();
      if (user) await audit(user.id, "logout", user.id);
      const r = json({ ok: true });
      r.headers.set("Set-Cookie", sessionCookie(req, "", 0));
      return r;
    }
    if (action === "forgot") {
      if (!(await emailConfig()))
        throw new ApiError(
          503,
          "Connectez votre service email dans Paramètres.",
        );
      const email = String(data.email ?? "")
        .toLowerCase()
        .trim();
      await rateLimit("reset:" + (await hash(email)), 3, 1800);
      const user = await db()
        .prepare("SELECT * FROM school_users WHERE email=? AND active=1")
        .bind(email)
        .first<UserRow>();
      if (user && !isDemoId(user.id)) {
        const token = randomToken();
        await db()
          .prepare(
            "INSERT INTO school_resets (token_hash,user_id,expires) VALUES (?,?,?)",
          )
          .bind(
            await hash(token),
            user.id,
            new Date(Date.now() + 1800000).toISOString(),
          )
          .run();
        await sendEmail(
          email,
          "Scola · Réinitialisation du mot de passe",
          `Réinitialisez votre mot de passe : ${(runtime().SCOLA_ORIGIN ?? new URL(req.url).origin) + "/?reset=" + token}\nCe lien expire dans 30 minutes. / ينتهي الرابط بعد 30 دقيقة.`,
        );
        await audit(user.id, "password.reset.request", user.id);
      }
      return json({ ok: true });
    }
    if (action === "reset") {
      const parsed = passwordSchema.safeParse(data.password);
      if (!parsed.success)
        throw new ApiError(400, parsed.error.issues[0].message);
      const tokenHash = await hash(String(data.token ?? ""));
      const row = await db()
        .prepare(
          "SELECT user_id FROM school_resets WHERE token_hash=? AND used=0 AND expires>?",
        )
        .bind(tokenHash, now())
        .first<{ user_id: string }>();
      if (!row) throw new ApiError(400, "Lien invalide ou expiré.");
      const hashed = await passwordHash(parsed.data);
      const results = await db().batch([
        db()
          .prepare(
            "UPDATE school_users SET password_hash=? WHERE id=? AND EXISTS(SELECT 1 FROM school_resets WHERE token_hash=? AND used=0 AND expires>?)",
          )
          .bind(hashed, row.user_id, tokenHash, now()),
        db()
          .prepare(
            "UPDATE school_resets SET used=1 WHERE token_hash=? AND used=0",
          )
          .bind(tokenHash),
        db()
          .prepare("DELETE FROM school_sessions WHERE user_id=?")
          .bind(row.user_id),
      ]);
      if (!results[0].meta.changes)
        throw new ApiError(400, "Lien déjà utilisé.");
      await audit(row.user_id, "password.reset", row.user_id);
      return json({ ok: true });
    }
    if (action === "password") {
      const user = await requireUser(req);
      const row = await db()
        .prepare("SELECT * FROM school_users WHERE id=?")
        .bind(user.id)
        .first<UserRow>();
      if (
        row?.password_hash &&
        !(await passwordMatches(
          String(data.currentPassword ?? ""),
          row.password_hash,
        ))
      )
        throw new ApiError(401, "Mot de passe actuel incorrect.");
      const parsed = passwordSchema.safeParse(data.password);
      if (!parsed.success)
        throw new ApiError(400, parsed.error.issues[0].message);
      await db().batch([
        db()
          .prepare("UPDATE school_users SET password_hash=? WHERE id=?")
          .bind(await passwordHash(parsed.data), user.id),
        db()
          .prepare("DELETE FROM school_sessions WHERE user_id=?")
          .bind(user.id),
      ]);
      await audit(user.id, "password.change", user.id);
      return session(req, user);
    }
    throw new ApiError(400, "Action inconnue.");
  } catch (e) {
    return responseError(e);
  }
}
