import { db } from "../server";
import { ApiError, audit, hash, now, userFrom, type UserRow } from "./auth";
import { canMessage, canRead, canWrite } from "./policy";
import {
  kinds,
  schemas,
  type Kind,
  type RecordItem,
  type User,
  type Values,
} from "./model";
import { notifyChange } from "./notifications";
type Row = {
  id: string;
  kind: Kind;
  data: string;
  version: number;
  created: string;
  updated: string;
  author_id: string;
};
export const recordFrom = (r: Row): RecordItem => ({
  id: r.id,
  kind: r.kind,
  data: JSON.parse(r.data),
  version: r.version,
  created: r.created,
  updated: r.updated,
  authorId: r.author_id,
});
export async function allRecords() {
  return (
    await db()
      .prepare(
        "SELECT * FROM school_records WHERE deleted=0 ORDER BY updated DESC",
      )
      .all<Row>()
  ).results.map(recordFrom);
}
export async function allUsers() {
  return (
    await db()
      .prepare("SELECT * FROM school_users ORDER BY name")
      .all<UserRow>()
  ).results.map(userFrom);
}
export async function importLegacy(user: User) {
  if (
    user.role !== "admin" ||
    (await db()
      .prepare("SELECT key FROM school_settings WHERE key='legacy-imported'")
      .first())
  )
    return;
  const rows = (
    await db()
      .prepare("SELECT * FROM students")
      .all<{ id: string; data: string; updated: string }>()
  ).results;
  const instant = now();
  const parsedRows = rows.map((r) => ({ ...r, student: JSON.parse(r.data) }));
  const years = [
    ...new Set(parsedRows.map((r) => String(r.student.year || "2026–2027"))),
  ];
  if (!years.length) years.push("2026–2027");
  const statements: D1PreparedStatement[] = [];
  const yearId = (name: string) => "year-" + name.replace(/[–—]/g, "-");
  for (const name of years) {
    const start = Number(name.slice(0, 4));
    if (!Number.isInteger(start) || start < 2000 || start > 2100)
      throw new ApiError(400, "Année scolaire historique invalide.");
    statements.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,'years',?,?,?,?)",
        )
        .bind(
          yearId(name),
          JSON.stringify({
            name,
            start: `${start}-09-01`,
            end: `${start + 1}-07-01`,
            active: name === "2026–2027",
          }),
          user.id,
          instant,
          instant,
        ),
    );
  }
  for (const r of parsedRows) {
    const s = r.student,
      year = String(s.year || "2026–2027"),
      classId = "class-" + (await hash(s.className + "|" + year));
    statements.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,'classes',?,?,?,?)",
        )
        .bind(
          classId,
          JSON.stringify({
            name: s.className,
            levelId: "",
            yearId: yearId(year),
            teacherIds: [],
            capacity: 30,
          }),
          user.id,
          instant,
          instant,
        ),
    );
    const data = {
      first: s.first,
      last: s.last,
      dob: s.dob,
      gender: s.gender,
      classId,
      yearId: yearId(year),
      status: s.status,
      address: s.address,
      notes: s.notes,
      parentIds: [],
      legacyParents: s.parents,
      demo: !!s.demo,
    };
    statements.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,'students',?,?,?,?)",
        )
        .bind(r.id, JSON.stringify(data), user.id, r.updated, r.updated),
    );
  }
  statements.push(
    db()
      .prepare(
        "INSERT OR IGNORE INTO school_files (id,record_id,kind,name,type,size,created,author_id) SELECT id,student_id,'students',name,type,size,created,? FROM documents",
      )
      .bind(user.id),
  );
  statements.push(
    db().prepare(
      "INSERT OR IGNORE INTO school_settings (key,value) VALUES ('legacy-imported','true')",
    ),
  );
  await db().batch(statements);
}
function requireRecord(records: RecordItem[], id: unknown, kind: Kind) {
  const row = records.find((r) => r.id === id && r.kind === kind);
  if (!row) throw new ApiError(400, "Référence introuvable : " + kind);
  return row;
}
export async function validateRelations(
  kind: Kind,
  data: Values,
  records: RecordItem[],
  users: User[],
  actor: User,
) {
  if (data.classId) requireRecord(records, data.classId, "classes");
  if (data.yearId) requireRecord(records, data.yearId, "years");
  if (data.levelId) requireRecord(records, data.levelId, "levels");
  if (data.subjectId) requireRecord(records, data.subjectId, "subjects");
  if (kind === "students") {
    for (const id of data.parentIds as string[]) {
      if (!users.find((u) => u.id === id && u.role === "parent" && u.active))
        throw new ApiError(400, "Responsable invalide.");
    }
    if (data.dob && String(data.dob) > now().slice(0, 10))
      throw new ApiError(400, "Date de naissance future.");
  }
  if (kind === "classes")
    for (const id of data.teacherIds as string[]) {
      if (!users.find((u) => u.id === id && u.role === "teacher" && u.active))
        throw new ApiError(400, "Enseignant invalide.");
    }
  if (data.studentId) {
    const s = requireRecord(records, data.studentId, "students");
    if (data.classId && s.data.classId !== data.classId)
      throw new ApiError(400, "L’élève n’appartient pas à cette classe.");
    if (!canRead(actor, s, records))
      throw new ApiError(403, "Élève non autorisé.");
  }
  if (kind === "grades") {
    const a = requireRecord(records, data.assessmentId, "assessments"),
      s = requireRecord(records, data.studentId, "students");
    if (
      a.data.classId !== s.data.classId ||
      Number(data.score) > Number(a.data.maximum)
    )
      throw new ApiError(400, "Note ou classe invalide.");
  }
  if (kind === "invoices" && data.scheduleId)
    requireRecord(records, data.scheduleId, "feeSchedules");
  if (kind === "payments") requireRecord(records, data.invoiceId, "invoices");
  if (kind === "messages") {
    const recipient = users.find((u) => u.id === data.recipientId);
    if (!recipient || !canMessage(actor, recipient, records))
      throw new ApiError(403, "Destinataire non autorisé.");
  }
}
export async function saveRecord(user: User, input: Record<string, unknown>) {
  const kind = input.kind as Kind;
  if (!kinds.includes(kind)) throw new ApiError(400, "Module inconnu.");
  const parsed = schemas[kind].safeParse(input.data);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues[0].message);
  const data = parsed.data as Values;
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(String(input.mutationId ?? "")))
    throw new ApiError(400, "Identifiant de synchronisation requis.");
  const mutationId = String(input.mutationId);
  const previous = await db()
    .prepare("SELECT result FROM school_mutations WHERE id=? AND user_id=?")
    .bind(mutationId, user.id)
    .first<{ result: string }>();
  if (previous) return JSON.parse(previous.result) as RecordItem;
  const records = await allRecords(),
    users = await allUsers();
  if (!canWrite(user, kind, data, records))
    throw new ApiError(403, "Modification non autorisée.");
  let id = typeof input.id === "string" ? input.id : crypto.randomUUID();
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id))
    throw new ApiError(400, "Identifiant invalide.");
  if (kind === "attendance")
    id =
      "att-" +
      (await hash([data.studentId, data.date, data.session].join("|")));
  if (kind === "invoices" && data.scheduleId)
    id = "inv-" + (await hash([data.scheduleId, data.studentId].join("|")));
  if (kind === "grades")
    id = "grade-" + (await hash([data.studentId, data.assessmentId].join("|")));
  const old = records.find((r) => r.id === id);
  if (old?.kind !== kind && old) throw new ApiError(400, "Module invalide.");
  if (
    old &&
    (!canRead(user, old, records) || !canWrite(user, kind, old.data, records))
  )
    throw new ApiError(403, "Modification non autorisée.");
  if (old && ["payments", "messages"].includes(kind))
    throw new ApiError(400, "Ce registre est immuable.");
  if (
    old &&
    kind === "invoices" &&
    records.some((r) => r.kind === "payments" && r.data.invoiceId === id) &&
    ["amount", "studentId"].some((k) => data[k] !== old.data[k])
  )
    throw new ApiError(
      400,
      "Une facture déjà réglée ne peut pas changer de montant ou d’élève.",
    );
  if (
    old &&
    kind === "students" &&
    old.data.classId !== data.classId &&
    records.some(
      (r) =>
        ["attendance", "grades"].includes(r.kind) && r.data.studentId === id,
    )
  )
    throw new ApiError(
      400,
      "Créez une nouvelle inscription pour conserver l’historique de ce profil.",
    );
  await validateRelations(kind, data, records, users, user);
  if (kind === "students" && old?.data.legacyParents)
    data.legacyParents = old.data.legacyParents;
  if (kind === "students" && old?.data.demo) data.demo = old.data.demo;
  const expected = Number(input.version ?? 0);
  if (old && expected !== old.version)
    throw new ApiError(
      409,
      "Ce dossier a changé. Rechargez avant d’enregistrer.",
    );
  if (!old && expected !== 0)
    throw new ApiError(409, "Ce dossier n’existe plus.");
  const instant = now(),
    result: RecordItem = {
      id,
      kind,
      data,
      version: (old?.version ?? 0) + 1,
      created: old?.created ?? instant,
      updated: instant,
      authorId: old?.authorId ?? user.id,
    };
  let statement: D1PreparedStatement;
  if (old)
    statement = db()
      .prepare(
        "UPDATE school_records SET data=?,version=version+1,updated=? WHERE id=? AND version=? AND deleted=0",
      )
      .bind(JSON.stringify(data), instant, id, expected);
  else if (kind === "payments")
    statement = db()
      .prepare(
        "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) SELECT ?,'payments',?,?,?,? WHERE CAST(json_extract((SELECT data FROM school_records WHERE id=? AND kind='invoices' AND deleted=0),'$.amount') AS INTEGER) >= ? + COALESCE((SELECT SUM(CAST(json_extract(data,'$.amount') AS INTEGER)) FROM school_records WHERE kind='payments' AND deleted=0 AND json_extract(data,'$.invoiceId')=?),0)",
      )
      .bind(
        id,
        JSON.stringify(data),
        user.id,
        instant,
        instant,
        data.invoiceId,
        data.amount,
        data.invoiceId,
      );
  else
    statement = db()
      .prepare(
        "INSERT OR IGNORE INTO school_records (id,kind,data,author_id,created,updated) VALUES (?,?,?,?,?,?)",
      )
      .bind(id, kind, JSON.stringify(data), user.id, instant, instant);
  const statements = [
    statement,
    db()
      .prepare(
        "INSERT INTO school_mutations (id,user_id,result,created) SELECT ?,?,?,? WHERE changes()=1",
      )
      .bind(mutationId, user.id, JSON.stringify(result), instant),
  ];
  if (kind === "students")
    statements.push(
      db()
        .prepare(
          "UPDATE school_users SET student_ids=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(student_ids) WHERE value<>? UNION SELECT ? WHERE EXISTS(SELECT 1 FROM json_each(?) WHERE value=school_users.id))) WHERE role='parent' AND EXISTS(SELECT 1 FROM school_mutations WHERE id=? AND user_id=?)",
        )
        .bind(id, id, JSON.stringify(data.parentIds), mutationId, user.id),
    );
  if (kind === "classes")
    statements.push(
      db()
        .prepare(
          "UPDATE school_users SET class_ids=(SELECT json_group_array(value) FROM (SELECT value FROM json_each(class_ids) WHERE value<>? UNION SELECT ? WHERE EXISTS(SELECT 1 FROM json_each(?) WHERE value=school_users.id))) WHERE role='teacher' AND EXISTS(SELECT 1 FROM school_mutations WHERE id=? AND user_id=?)",
        )
        .bind(id, id, JSON.stringify(data.teacherIds), mutationId, user.id),
    );
  const results = await db().batch(statements);
  if (!results[0].meta.changes) {
    const retry = await db()
      .prepare("SELECT result FROM school_mutations WHERE id=? AND user_id=?")
      .bind(mutationId, user.id)
      .first<{ result: string }>();
    if (retry) return JSON.parse(retry.result) as RecordItem;
  }
  if (!results[0].meta.changes)
    throw new ApiError(
      kind === "payments" ? 400 : 409,
      kind === "payments"
        ? "Le paiement dépasse le solde de la facture."
        : "Ce dossier a changé. Rechargez avant d’enregistrer.",
    );
  await audit(user.id, kind + ".save", id);
  try {
    await notifyChange(user, result, old);
  } catch (e) {
    console.error("notification delivery", e);
  }
  return result;
}
export async function deleteRecord(user: User, input: Record<string, unknown>) {
  const records = await allRecords(),
    r = records.find((r) => r.id === input.id);
  if (!r) throw new ApiError(404, "Dossier introuvable.");
  if (
    user.role !== "admin" ||
    ["payments", "messages", "invoices"].includes(r.kind)
  )
    throw new ApiError(
      403,
      "Archivez ce dossier ; le registre doit être conservé.",
    );
  const users = await allUsers();
  if (
    users.some((u) => u.classIds.includes(r.id) || u.studentIds.includes(r.id))
  )
    throw new ApiError(400, "Ce dossier est lié à un compte utilisateur.");
  if (
    records.some(
      (v) =>
        v.id !== r.id &&
        Object.values(v.data).some(
          (x) => x === r.id || (Array.isArray(x) && x.includes(r.id)),
        ),
    )
  )
    throw new ApiError(
      400,
      "Ce dossier est utilisé par d’autres données. Archivez-le ou modifiez ses liens.",
    );
  const result = await db()
    .prepare(
      "UPDATE school_records SET deleted=1,version=version+1,updated=? WHERE id=? AND version=? AND deleted=0",
    )
    .bind(now(), r.id, Number(input.version))
    .run();
  if (!result.meta.changes) throw new ApiError(409, "Ce dossier a changé.");
  await audit(user.id, r.kind + ".delete", r.id);
  return { ok: true };
}
