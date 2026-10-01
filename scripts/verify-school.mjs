import assert from "node:assert/strict";
const base = process.argv[2] ?? "http://127.0.0.1:5173";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Verification writes test records; use a local server only.");
const tag = "qa-" + crypto.randomUUID().slice(0, 8);
const created = [];
const ownerEmail = process.argv[3] ?? "owner@example.test";
const owner = {
  "oai-authenticated-user-id": "local-owner-verification",
  "oai-authenticated-user-email": ownerEmail,
};
async function call(
  path,
  method = "GET",
  value,
  headers = owner,
  status = 200,
) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(value !== undefined
        ? { "Content-Type": "application/json", Origin: base }
        : {}),
      ...headers,
    },
    body: value !== undefined ? JSON.stringify(value) : undefined,
  });
  const text = await response.text();
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${response.status} ${text}`,
  );
  return text ? JSON.parse(text) : null;
}
const snapshot = await call("/api/school");
assert.equal(snapshot.user.role, "admin");
for (const route of ["/api/auth", "/api/school"]) {
  for (const value of [null, [], "invalid", 1, true])
    await call(route, "POST", value, owner, 400);
}

await call("/api/school", "GET", undefined, {}, 401);
await call("/api/students", "GET", undefined, {}, 401);
await call("/api/documents?id=unknown", "GET", undefined, {}, 401);
await call(
  "/api/school",
  "GET",
  undefined,
  {
    "oai-authenticated-user-id": tag,
    "oai-authenticated-user-email": "outsider@example.com",
  },
  401,
);
async function save(kind, data, headers = owner, old) {
  const id = old?.id ?? tag + "-" + crypto.randomUUID().slice(0, 8);
  const input = {
    id,
    kind,
    data,
    version: old?.version ?? 0,
    mutationId: crypto.randomUUID(),
  };
  const result = await call("/api/school", "POST", input, headers);
  created.push({ id: result.id, kind });
  return { result, input };
}
const year = (
  await save("years", {
    name: tag,
    start: "2026-09-01",
    end: "2027-07-01",
    active: true,
  })
).result;
const level = (await save("levels", { name: tag, order: 1 })).result;
const cls = (
  await save("classes", {
    name: tag,
    levelId: level.id,
    yearId: year.id,
    teacherIds: [],
    capacity: 30,
  })
).result;
const other = (
  await save("classes", {
    name: tag + "-private",
    levelId: level.id,
    yearId: year.id,
    teacherIds: [],
    capacity: 30,
  })
).result;
const subject = (await save("subjects", { name: tag, coefficient: 2 })).result;
const pupil = (
  await save("students", {
    first: tag,
    last: "Élève",
    dob: "2017-01-01",
    gender: "F",
    classId: cls.id,
    yearId: year.id,
    status: "active",
    address: "",
    notes: "",
    parentIds: [],
  })
).result;
const privatePupil = (
  await save("students", {
    first: tag,
    last: "Privé",
    dob: "2017-01-01",
    gender: "M",
    classId: other.id,
    yearId: year.id,
    status: "active",
    address: "",
    notes: "",
    parentIds: [],
  })
).result;
const password = "TestOnly-" + crypto.randomUUID();
async function account(role, classIds = [], studentIds = []) {
  const user = await call("/api/school", "POST", {
    action: "user",
    data: {
      name: tag + "-" + role,
      email: tag + "-" + role + "@example.com",
      role,
      classIds,
      studentIds,
      active: true,
    },
    password,
  });
  const login = await call(
    "/api/auth",
    "POST",
    { action: "login", email: user.email, password },
    {},
  );
  assert.equal(login.user.role, role);
  return { user, headers: { Authorization: "Bearer " + login.token } };
}
const teacher = await account("teacher", [cls.id]),
  parent = await account("parent", [], [pupil.id]),
  student = await account("student", [], [pupil.id]);
const parentSnapshot = await call(
  "/api/school",
  "GET",
  undefined,
  parent.headers,
);
assert.ok(parentSnapshot.records.some((r) => r.id === pupil.id));
assert.ok(!parentSnapshot.records.some((r) => r.id === privatePupil.id));
assert.equal(parentSnapshot.audit.length, 0);
await call(
  "/api/school",
  "POST",
  {
    kind: "students",
    id: pupil.id,
    data: pupil.data,
    version: 1,
    mutationId: crypto.randomUUID(),
  },
  parent.headers,
  403,
);
await call(
  "/api/school",
  "POST",
  { action: "user", data: {} },
  teacher.headers,
  403,
);
const att = (
  await save(
    "attendance",
    {
      studentId: pupil.id,
      classId: cls.id,
      date: "2026-10-01",
      session: tag,
      status: "absent",
      minutes: 0,
      note: "",
    },
    teacher.headers,
  )
).result;
await call(
  "/api/school",
  "POST",
  {
    id: crypto.randomUUID(),
    kind: "attendance",
    data: { ...att.data, studentId: privatePupil.id, classId: other.id },
    version: 0,
    mutationId: crypto.randomUUID(),
  },
  teacher.headers,
  403,
);
let notices = (await call("/api/school", "GET", undefined, parent.headers))
  .notifications;
assert.ok(notices.some((n) => n.link === "attendance"));
const assignment = (
  await save(
    "homework",
    {
      title: tag,
      classId: cls.id,
      subjectId: subject.id,
      instructions: "Lire le chapitre 1.",
      due: "2026-10-03",
    },
    teacher.headers,
  )
).result;
const assessment = (
  await save(
    "assessments",
    {
      title: tag,
      classId: cls.id,
      subjectId: subject.id,
      date: "2026-10-01",
      term: "T1",
      maximum: 20,
      coefficient: 2,
    },
    teacher.headers,
  )
).result;
await save(
  "grades",
  {
    studentId: pupil.id,
    assessmentId: assessment.id,
    score: 16,
    comment: "Très bien",
  },
  teacher.headers,
);
await call(
  "/api/school",
  "POST",
  {
    kind: "grades",
    data: {
      studentId: pupil.id,
      assessmentId: assessment.id,
      score: 21,
      comment: "",
    },
    mutationId: crypto.randomUUID(),
  },
  teacher.headers,
  400,
);
const schedule = (
  await save("feeSchedules", {
    title: tag,
    classId: cls.id,
    yearId: year.id,
    amount: 10000,
    due: "2026-09-30",
  })
).result;
const invoice = (
  await save("invoices", {
    studentId: pupil.id,
    scheduleId: schedule.id,
    title: tag,
    amount: 10000,
    due: "2026-09-30",
  })
).result;
const payment = await save("payments", {
  invoiceId: invoice.id,
  amount: 6000,
  date: "2026-10-01",
  method: "cash",
  reference: tag,
});
assert.deepEqual(
  await call("/api/school", "POST", payment.input),
  payment.result,
  "Idempotent retry returns same result",
);
await call(
  "/api/school",
  "POST",
  {
    id: tag + "-overpay",
    kind: "payments",
    data: { ...payment.result.data, amount: 5000 },
    version: 0,
    mutationId: crypto.randomUUID(),
  },
  owner,
  400,
);
await call(
  "/api/school",
  "POST",
  {
    id: tag + "-pay",
    kind: "payments",
    data: { ...payment.result.data, amount: 1000 },
    version: 0,
    mutationId: crypto.randomUUID(),
  },
  parent.headers,
  403,
);
await save("payments", {
  invoiceId: invoice.id,
  amount: 4000,
  date: "2026-10-01",
  method: "transfer",
  reference: tag,
});
const raceInvoice = (
  await save("invoices", {
    studentId: pupil.id,
    scheduleId: "",
    title: tag + "-race",
    amount: 10000,
    due: "2026-09-30",
  })
).result;
const race = await Promise.all(
  [1, 2].map((n) =>
    fetch(base + "/api/school", {
      method: "POST",
      headers: { ...owner, "Content-Type": "application/json", Origin: base },
      body: JSON.stringify({
        id: tag + "-race-" + n,
        kind: "payments",
        version: 0,
        mutationId: crypto.randomUUID(),
        data: {
          invoiceId: raceInvoice.id,
          amount: 7000,
          date: "2026-10-01",
          method: "cash",
          reference: tag,
        },
      }),
    }),
  ),
);
assert.deepEqual(
  race.map((r) => r.status).sort(),
  [200, 400],
  "Concurrent payments cannot overpay",
);
const parentFeeSnapshot = await call(
  "/api/school",
  "GET",
  undefined,
  parent.headers,
);
assert.ok(parentFeeSnapshot.records.some((r) => r.id === invoice.id));
assert.ok(
  !(await call("/api/school", "GET", undefined, teacher.headers)).records.some(
    (r) => r.id === invoice.id,
  ),
);
await save(
  "announcements",
  {
    title: tag,
    body: "Réunion de classe",
    classId: cls.id,
    role: "parent",
    publishDate: "2026-10-01",
  },
  teacher.headers,
);
await save("events", {
  title: tag,
  start: "2026-10-02",
  end: "2026-10-02",
  classId: cls.id,
  description: "Réunion",
});
await save(
  "messages",
  { recipientId: teacher.user.id, body: tag + " Message de parent" },
  parent.headers,
);
await save(
  "messages",
  { recipientId: parent.user.id, body: tag + " Réponse" },
  teacher.headers,
);
await call(
  "/api/school",
  "POST",
  {
    kind: "messages",
    data: { recipientId: student.user.id, body: "unauthorized" },
    mutationId: crypto.randomUUID(),
  },
  parent.headers,
  403,
);
const updated = await save(
  "homework",
  { ...assignment.data, title: tag + " updated" },
  teacher.headers,
  assignment,
);
assert.equal(updated.result.version, 2);
await call(
  "/api/school",
  "POST",
  { ...updated.input, version: 1, mutationId: crypto.randomUUID() },
  teacher.headers,
  409,
);
await call(
  "/api/school",
  "POST",
  { ...updated.input, mutationId: crypto.randomUUID() },
  { ...teacher.headers, Origin: "https://evil.example" },
  403,
);
const form = new FormData();
form.set("record", assignment.id);
form.set(
  "file",
  new Blob(["%PDF-1.4\n" + tag + "\n%%EOF"], { type: "application/pdf" }),
  "test.pdf",
);
let response = await fetch(base + "/api/documents", {
  method: "POST",
  headers: { ...teacher.headers, Origin: base },
  body: form,
});
assert.equal(response.status, 200, await response.clone().text());
const { id: fileId } = await response.json();
response = await fetch(base + "/api/documents?id=" + fileId, {
  headers: parent.headers,
});
assert.equal(response.status, 200);
assert.ok((await response.text()).includes(tag));
const privateFile = new FormData();
privateFile.set("record", privatePupil.id);
privateFile.set(
  "file",
  new Blob(["%PDF-1.4\n"], { type: "application/pdf" }),
  "test.pdf",
);
response = await fetch(base + "/api/documents", {
  method: "POST",
  headers: parent.headers,
  body: privateFile,
});
assert.equal(response.status, 403);
await call(
  "/api/push",
  "POST",
  {
    subscription: {
      endpoint: "https://example.com/",
      keys: { p256dh: "x", auth: "x" },
    },
  },
  parent.headers,
  400,
);
await call("/api/school", "POST", { action: "remind" });
await call(
  "/api/school",
  "POST",
  { action: "read", id: "all" },
  parent.headers,
);
assert.ok(
  (
    await call("/api/school", "GET", undefined, parent.headers)
  ).notifications.every((n) => n.read),
);
await call(
  "/api/auth",
  "POST",
  {
    action: "password",
    currentPassword: "wrong",
    password: "NewPassword-12345",
  },
  teacher.headers,
  401,
);
const loginNew = await call(
  "/api/auth",
  "POST",
  {
    action: "password",
    currentPassword: password,
    password: "NewPassword-12345",
  },
  teacher.headers,
);
assert.ok(loginNew.token);
await call("/api/school", "GET", undefined, teacher.headers, 401);
await call(
  "/api/auth",
  "POST",
  { action: "logout" },
  { Authorization: "Bearer " + loginNew.token },
);
await call(
  "/api/school",
  "GET",
  undefined,
  { Authorization: "Bearer " + loginNew.token },
  401,
);
await call(
  "/api/auth",
  "POST",
  { action: "reset", token: "invalid", password: "NewPassword-12345" },
  {},
  400,
);
await call(
  "/api/auth",
  "POST",
  { action: "forgot", email: parent.user.email },
  {},
  503,
);
await call("/api/school", "POST", {
  action: "user",
  id: parent.user.id,
  data: { ...parent.user, active: false },
});
await call("/api/school", "GET", undefined, parent.headers, 401);
await call(
  "/api/school",
  "POST",
  {
    action: "user",
    id: snapshot.user.id,
    data: { ...snapshot.user, active: false },
  },
  owner,
  400,
);
response = await fetch(base + "/");
assert.equal(response.status, 200);
assert.match(await response.text(), /Scola/);
response = await fetch(base + "/sw.js");
assert.equal(response.status, 200);
assert.match(await response.text(), /scola-shell/);
console.log(
  "PASS: authentication, role isolation, all school modules, optimistic conflicts, payment limits/idempotency, parent notifications, private messaging, D1/R2 files, push endpoint validation, password/session revocation, and PWA assets.",
);
console.log("Cleanup test prefix: " + tag);
