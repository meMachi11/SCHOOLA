import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
// Verify the protocol independently: encrypt with the application, decrypt as a receiving browser.
const source = readFileSync("lib/school/push.ts", "utf8");
const start = source.indexOf("const buffer ="),
  end = source.indexOf("export async function vapid");
const encryptionStart = source.indexOf("  const receiver = decode(sub.p256dh)"),
  encryptionEnd = source.indexOf(
    "  const config = await vapid()",
    encryptionStart,
  );
assert.ok(start >= 0 && end > start && encryptionStart >= 0 && encryptionEnd > encryptionStart, "Encryption source boundaries must resolve");
const code = ts.transpileModule(
  source.slice(start, end) +
    `\nexport async function encrypt(sub,payload){${source.slice(encryptionStart, encryptionEnd)}return encrypted;}`,
  {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const header = `const bytes=v=>new TextEncoder().encode(v);const encode=v=>Buffer.from(v).toString('base64url');const decode=v=>new Uint8Array(Buffer.from(v,'base64url'));class ApiError extends Error {}\n`;
const { encrypt } = await import(
  "data:text/javascript;base64," + Buffer.from(header + code).toString("base64")
);
const receiver = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveBits"],
);
const receiverPublic = new Uint8Array(
  await crypto.subtle.exportKey("raw", receiver.publicKey),
);
const auth = crypto.getRandomValues(new Uint8Array(16));
const payload = {
  title: "Scola",
  body: "Test français / اختبار عربي",
  link: "homework",
};
const encrypted = await encrypt(
  {
    p256dh: Buffer.from(receiverPublic).toString("base64url"),
    auth: Buffer.from(auth).toString("base64url"),
  },
  payload,
);
const salt = encrypted.slice(0, 16),
  recordSize = new DataView(
    encrypted.buffer,
    encrypted.byteOffset + 16,
    4,
  ).getUint32(0);
assert.equal(recordSize, 4096);
assert.equal(encrypted[20], 65);
const senderPublic = encrypted.slice(21, 86);
const key = await crypto.subtle.importKey(
  "raw",
  senderPublic,
  { name: "ECDH", namedCurve: "P-256" },
  false,
  [],
);
const shared = await crypto.subtle.deriveBits(
  { name: "ECDH", public: key },
  receiver.privateKey,
  256,
);
const encoder = new TextEncoder();
async function derive(input, salt, info, len) {
  const key = await crypto.subtle.importKey("raw", input, "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    len * 8,
  );
}
const info = Buffer.concat([
  encoder.encode("WebPush: info\0"),
  receiverPublic,
  senderPublic,
]);
const material = await derive(shared, auth, info, 32);
const aes = await derive(
    material,
    salt,
    encoder.encode("Content-Encoding: aes128gcm\0"),
    16,
  ),
  nonce = await derive(
    material,
    salt,
    encoder.encode("Content-Encoding: nonce\0"),
    12,
  );
const aesKey = await crypto.subtle.importKey("raw", aes, "AES-GCM", false, [
  "decrypt",
]);
const decrypted = new Uint8Array(
  await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    aesKey,
    encrypted.slice(86),
  ),
);
assert.equal(decrypted.at(-1), 2);
assert.deepEqual(
  JSON.parse(new TextDecoder().decode(decrypted.slice(0, -1))),
  payload,
);
console.log(
  "PASS: RFC 8291 Web Push payload encryption decrypts independently, including French/Arabic UTF-8 content.",
);
