import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("lib/school/auth.ts", "utf8");
const start = source.indexOf("export async function body(");
const end = source.indexOf("export function responseError", start);
assert.ok(start >= 0 && end > start);
const code = ts.transpileModule(source.slice(start, end), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const header = `class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }\n`;
const { body } = await import(
  "data:text/javascript;base64," + Buffer.from(header + code).toString("base64"),
);
const request = (text) => new Request("https://local.example.test", {
  method: "POST",
  body: text,
});
for (const value of [null, [], "invalid", 1, true])
  await assert.rejects(() => body(request(JSON.stringify(value))), e => e.status === 400);
await assert.rejects(() => body(request("{invalid")), e => e.status === 400);
await assert.rejects(() => body(request("")), e => e.status === 400);
const multilingual = { text: "Français / العربية" };
assert.deepEqual(await body(request(JSON.stringify(multilingual))), multilingual);
const padding = "x".repeat(65536 - Buffer.byteLength(JSON.stringify({ padding: "" })));
assert.equal(Buffer.byteLength(JSON.stringify({ padding })), 65536);
assert.equal((await body(request(JSON.stringify({ padding })))).padding, padding);
await assert.rejects(() => body(request(JSON.stringify({ padding: padding + "x" }))), e => e.status === 413);
await assert.rejects(() => body(request(JSON.stringify({ padding: "م".repeat(40000) }))), e => e.status === 413);
let cancelled = false, pulls = 0;
const stream = new ReadableStream({
  pull(controller) { pulls++; controller.enqueue(new Uint8Array(4096)); },
  cancel() { cancelled = true; },
});
await assert.rejects(() => body(new Request("https://local.example.test", {
  method: "POST", body: stream, duplex: "half",
})), e => e.status === 413);
assert.equal(cancelled, true, "Oversized chunked upload must be cancelled");
assert.ok(pulls <= 18, "Stop reading once the byte limit is exceeded");
console.log("PASS: JSON object validation, malformed/empty input, French/Arabic UTF-8, exact 64 KB boundary, and bounded/cancelled chunked uploads.");
