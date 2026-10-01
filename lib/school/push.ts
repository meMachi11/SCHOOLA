import { db } from "../server";
import { ApiError, bytes, decode, encode, now } from "./auth";
const buffer = (v: Uint8Array) => Uint8Array.from(v).buffer;
const join = (...parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
};
async function hkdf(
  input: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    buffer(input),
    "HKDF",
    false,
    ["deriveBits"],
  );
  return new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: buffer(salt), info: buffer(info) },
      key,
      length * 8,
    ),
  );
}
export function allowedEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      (u.hostname === "fcm.googleapis.com" ||
        u.hostname === "updates.push.services.mozilla.com" ||
        u.hostname === "web.push.apple.com" ||
        u.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}
export async function vapid() {
  const row = await db()
    .prepare("SELECT value FROM school_settings WHERE key='vapid'")
    .first<{ value: string }>();
  if (row)
    return JSON.parse(row.value) as {
      publicKey: string;
      privateKey: JsonWebKey;
    };
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const value = {
    publicKey: encode(await crypto.subtle.exportKey("raw", keys.publicKey)),
    privateKey: await crypto.subtle.exportKey("jwk", keys.privateKey),
  };
  await db()
    .prepare(
      "INSERT OR IGNORE INTO school_settings (key,value) VALUES ('vapid',?)",
    )
    .bind(JSON.stringify(value))
    .run();
  return vapid();
}
export type PushRow = {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
};
export async function sendPush(sub: PushRow, payload: unknown) {
  if (!allowedEndpoint(sub.endpoint))
    throw new ApiError(400, "Service push non autorisé.");
  const receiver = decode(sub.p256dh),
    auth = decode(sub.auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const sender = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const publicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", sender.publicKey),
  );
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    buffer(receiver),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: receiverKey },
      sender.privateKey,
      256,
    ),
  );
  const input = await hkdf(
    shared,
    auth,
    join(bytes("WebPush: info\0"), receiver, publicKey),
    32,
  );
  const key = await hkdf(
      input,
      salt,
      bytes("Content-Encoding: aes128gcm\0"),
      16,
    ),
    nonce = await hkdf(input, salt, bytes("Content-Encoding: nonce\0"), 12);
  const content = bytes(JSON.stringify(payload));
  if (content.length > 2048)
    throw new ApiError(400, "Notification trop longue.");
  const aes = await crypto.subtle.importKey(
    "raw",
    buffer(key),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buffer(nonce) },
      aes,
      buffer(join(content, new Uint8Array([2]))),
    ),
  );
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, 4096);
  const encrypted = join(
    salt,
    size,
    new Uint8Array([65]),
    publicKey,
    ciphertext,
  );
  const config = await vapid();
  const jwt =
    encode(bytes(JSON.stringify({ typ: "JWT", alg: "ES256" }))) +
    "." +
    encode(
      bytes(
        JSON.stringify({
          aud: new URL(sub.endpoint).origin,
          exp: Math.floor(Date.now() / 1000) + 43200,
          sub: "mailto:contact@schoolapp.space",
        }),
      ),
    );
  const signing = await crypto.subtle.importKey(
    "jwk",
    config.privateKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = encode(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signing,
      bytes(jwt),
    ),
  );
  const result = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}.${signature}, k=${config.publicKey}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
    },
    body: buffer(encrypted),
  });
  if (result.status === 404 || result.status === 410)
    await db()
      .prepare("DELETE FROM school_push WHERE endpoint=?")
      .bind(sub.endpoint)
      .run();
  if (!result.ok) throw new Error("Push delivery status " + result.status);
}
export async function pushUser(
  userId: string,
  title: string,
  body: string,
  link: string,
) {
  const rows = (
    await db()
      .prepare("SELECT * FROM school_push WHERE user_id=?")
      .bind(userId)
      .all<PushRow>()
  ).results;
  const result = await Promise.allSettled(
    rows.map((r) => sendPush(r, { title, body, link })),
  );
  for (const r of result)
    if (r.status === "rejected") console.error("Push failed", r.reason);
  return {
    devices: rows.length,
    sent: result.filter((r) => r.status === "fulfilled").length,
    at: now(),
  };
}
