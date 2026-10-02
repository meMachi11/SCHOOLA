import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://127.0.0.1:4173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error(
    "Demo verification writes fixtures; use a local server only.",
  );
const owner = {
  "oai-authenticated-user-id": "demo-test-owner",
  "oai-authenticated-user-email": process.argv[3] ?? "owner@example.test",
};
const prefix = "scola-demo-v1-",
  tag = "demo-check-" + crypto.randomUUID();
async function api(
  method = "GET",
  value,
  status = 200,
  headers = owner,
  route = "/api/school",
) {
  const r = await fetch(base + route, {
    method,
    headers: {
      ...headers,
      ...(value !== undefined
        ? { "Content-Type": "application/json", Origin: base }
        : {}),
    },
    body: value !== undefined ? JSON.stringify(value) : undefined,
  });
  assert.equal(r.status, status, await r.clone().text());
  return r.json();
}
await api("GET", undefined, 200, owner, "/api/auth");
const real = await api("POST", {
  kind: "levels",
  id: tag,
  version: 0,
  mutationId: crypto.randomUUID(),
  data: { name: "Real record preserved", order: 1 },
});
let snapshot = await api();
const demo = snapshot.records.filter((r) => r.data.demo);
assert.equal(demo.length, 128);
for (const kind of [
  "years",
  "levels",
  "classes",
  "subjects",
  "students",
  "events",
  "attendance",
  "homework",
  "assessments",
  "grades",
  "feeSchedules",
  "invoices",
  "payments",
  "announcements",
  "messages",
])
  assert.ok(
    demo.some((r) => r.kind === kind),
    kind + " examples missing",
  );
assert.equal(demo.filter((r) => r.kind === "students").length, 8);
assert.equal(snapshot.users.filter((u) => u.id.startsWith(prefix)).length, 9);
assert.ok(
  snapshot.users
    .filter((u) => u.id.startsWith(prefix))
    .every((u) => u.email.endsWith("@scola.example.test")),
);
assert.equal(
  snapshot.notifications.filter((n) => n.id.startsWith(prefix)).length,
  6,
);
assert.equal(snapshot.files.filter((f) => f.id.startsWith(prefix)).length, 3);
assert.deepEqual(
  snapshot.records.find((r) => r.id === real.id),
  real,
);
for (const record of demo) {
  for (const [key, value] of Object.entries(record.data)) {
    if (!/Ids?$/.test(key) || !value) continue;
    for (const id of Array.isArray(value) ? value : [value])
      assert.ok(
        snapshot.records.some((r) => r.id === id) ||
          snapshot.users.some((u) => u.id === id),
        `Missing ${record.kind}.${key} reference`,
      );
  }
}
for (const invoice of demo.filter((r) => r.kind === "invoices")) {
  const paid = demo
    .filter((r) => r.kind === "payments" && r.data.invoiceId === invoice.id)
    .reduce((sum, r) => sum + r.data.amount, 0);
  assert.ok(paid <= invoice.data.amount && Number.isInteger(paid));
}
for (const file of snapshot.files.filter((f) => f.id.startsWith(prefix))) {
  const r = await fetch(base + "/api/documents?id=" + file.id, {
    headers: owner,
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("Content-Type"), "application/pdf");
  const pdf = await r.text();
  assert.match(pdf, /^%PDF-1\.4/);
  assert.match(pdf, /DONNEES FICTIVES/);
  assert.match(pdf, /xref/);
  assert.match(pdf, /%%EOF$/);
}
const first = snapshot.records.find(
  (r) => r.kind === "students" && r.id === prefix + "student-0",
);
const parent = await api("POST", {
  action: "user",
  data: {
    name: "Real parent test",
    email: tag + "@example.test",
    role: "parent",
    classIds: [],
    studentIds: [first.id],
    active: true,
  },
  password: "Demo-check-only-12345",
});
const login = await api(
  "POST",
  { action: "login", email: parent.email, password: "Demo-check-only-12345" },
  200,
  {},
  "/api/auth",
);
const parentHeaders = { Authorization: "Bearer " + login.token };
const before = await api("GET", undefined, 200, parentHeaders);
const attendance = snapshot.records.find(
  (r) =>
    r.kind === "attendance" &&
    r.data.studentId === first.id &&
    r.data.date === new Date().toISOString().slice(0, 10),
);
const update = await api("POST", {
  ...attendance,
  mutationId: crypto.randomUUID(),
  data: { ...attendance.data, status: "late", minutes: 5 },
});
assert.equal(update.id, attendance.id);
assert.equal(update.version, attendance.version + 1);
assert.equal(update.data.demo, true);
assert.equal(
  (await api("GET", undefined, 200, parentHeaders)).notifications.length,
  before.notifications.length,
  "Demo edits must not notify a linked real parent",
);
const invoice = snapshot.records.find(
  (r) =>
    r.kind === "invoices" &&
    r.data.studentId === prefix + "student-2" &&
    r.data.scheduleId,
);
const payment = await api("POST", {
  kind: "payments",
  id: tag + "-pay",
  version: 0,
  mutationId: crypto.randomUUID(),
  data: {
    invoiceId: invoice.id,
    amount: 5000,
    date: new Date().toISOString().slice(0, 10),
    method: "cash",
    reference: "Test demo classification",
  },
});
assert.equal(
  payment.data.demo,
  true,
  "New payments must inherit a demo invoice's marker",
);
assert.equal(
  (await api("POST", { action: "remind" })).count,
  0,
  "Fake balances must never trigger real fee reminders",
);
await api("POST", { action: "demo" }, 403, parentHeaders);
await api("POST", { action: "demo" });
snapshot = await api();
assert.equal(snapshot.records.filter((r) => r.data.demo).length, 129);
assert.equal(snapshot.files.filter((f) => f.id.startsWith(prefix)).length, 3);
assert.equal(
  snapshot.notifications.filter((n) => n.id.startsWith(prefix)).length,
  6,
);
assert.equal(
  snapshot.records.find((r) => r.id === attendance.id).version,
  update.version,
  "Retry must preserve edited examples",
);
assert.deepEqual(
  snapshot.records.find((r) => r.id === real.id),
  real,
  "Real records must not change",
);
await api(
  "POST",
  {
    action: "login",
    email: "teacher-1@scola.example.test",
    password: "Any-password-12345",
  },
  401,
  {},
  "/api/auth",
);
console.log(
  "PASS: all 15 modules seeded, 8 profiles/9 fictional accounts/3 PDFs, valid relationships and balances, retries preserve edits/real data, demo classification propagates, reminders/real-parent notices suppressed, admin-only loading, no demo passwords.",
);
