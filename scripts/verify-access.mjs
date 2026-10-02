import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.argv[2] ?? "http://127.0.0.1:4173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Use a disposable local database only.");
const owner = {
  "oai-authenticated-user-id": "demo-test-owner",
  "oai-authenticated-user-email": "owner@example.test",
};
async function api(
  headers,
  method = "GET",
  data,
  status = 200,
  path = "/api/school",
) {
  const r = await fetch(base + path, {
    method,
    headers: {
      ...headers,
      ...(data ? { "Content-Type": "application/json", Origin: base } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  const v = await r.json();
  assert.equal(r.status, status, JSON.stringify(v));
  return v;
}
const all = await api(owner),
  tag = "access-" + crypto.randomUUID().slice(0, 8),
  password = "AccessChecks2026!";
const classId = "scola-demo-v1-class-cm1",
  otherClass = "scola-demo-v1-class-cm2",
  pupil = "scola-demo-v1-student-0",
  otherPupil = "scola-demo-v1-student-4";
assert.ok(
  all.records.some((r) => r.id === pupil),
  "Enable demo seed first",
);
const fixtures = { base, owner, password, accounts: {} };
for (const role of ["teacher", "parent", "student"]) {
  const email = tag + "-" + role + "@example.test";
  const user = await api(owner, "POST", {
    action: "user",
    data: {
      name: "Access test " + role,
      email,
      role,
      active: true,
      classIds: role === "teacher" ? [classId] : [],
      studentIds: role === "teacher" ? [] : [pupil],
    },
    password,
  });
  const login = await api(
    {},
    "POST",
    { action: "login", email, password, role: "admin" },
    200,
    "/api/auth",
  );
  const headers = { Authorization: "Bearer " + login.token };
  const snapshot = await api(headers);
  assert.equal(
    snapshot.user.role,
    role,
    "Client-selected role must not elevate account",
  );
  assert.ok(snapshot.records.some((r) => r.id === pupil));
  assert.ok(!snapshot.records.some((r) => r.id === otherPupil));
  assert.equal(snapshot.audit.length, 0);
  assert.ok(snapshot.users.every((u) => u.email === ""));
  const finances = snapshot.records.filter((r) =>
    ["invoices", "payments", "feeSchedules"].includes(r.kind),
  );
  if (role === "parent") assert.ok(finances.length > 0);
  else assert.equal(finances.length, 0);
  for (const r of snapshot.records.filter((r) =>
    ["attendance", "grades"].includes(r.kind),
  ))
    assert.ok(role === "teacher" || r.data.studentId === pupil);
  for (const action of ["user", "settings", "demo"])
    await api(headers, "POST", { action, data: {} }, 403);
  await api(
    headers,
    "POST",
    {
      kind: "homework",
      data: {
        classId: otherClass,
        title: "Forbidden",
        instructions: "Scope check",
        due: "2026-12-01",
        subjectId: "scola-demo-v1-subject-0",
      },
      mutationId: crypto.randomUUID(),
      version: 0,
    },
    403,
  );
  if (role !== "teacher")
    await api(
      headers,
      "POST",
      {
        kind: "homework",
        data: {
          classId,
          title: "Forbidden",
          instructions: "Scope check",
          due: "2026-12-01",
          subjectId: "scola-demo-v1-subject-0",
        },
        mutationId: crypto.randomUUID(),
        version: 0,
      },
      403,
    );
  const pdf = await fetch(
    base + "/api/documents?id=scola-demo-v1-file-student",
    { headers },
  );
  assert.equal(pdf.status, 200);
  assert.match(await pdf.text(), /^%PDF/);
  fixtures.accounts[role] = { email, user, headers };
}
await api(
  owner,
  "POST",
  {
    action: "user",
    data: {
      name: "Invalid student",
      email: tag + "-invalid@example.test",
      role: "student",
      active: true,
      classIds: [],
      studentIds: [pupil, otherPupil],
    },
    password,
  },
  400,
);
const teacher = fixtures.accounts.teacher.headers;
await api(teacher, "POST", {
  kind: "homework",
  data: {
    classId,
    title: "Assigned class work",
    instructions: "Scope check",
    due: "2026-12-01",
    subjectId: "scola-demo-v1-subject-0",
  },
  mutationId: crypto.randomUUID(),
  version: 0,
});
if (process.env.SCOLA_ACCESS_FIXTURE_FILE)
  await writeFile(
    process.env.SCOLA_ACCESS_FIXTURE_FILE,
    JSON.stringify(fixtures),
    { mode: 0o600 },
  );
console.log(
  "PASS: four roles, login cannot elevate role, teacher class boundary, parent/student record isolation, finance visibility, admin-only operations, single student assignment.",
);
