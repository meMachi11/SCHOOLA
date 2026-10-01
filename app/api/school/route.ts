import { db } from "../../../lib/server";
import {
  ApiError,
  body,
  checkOrigin,
  json,
  now,
  requireUser,
  responseError,
  saveUser,
} from "../../../lib/school/auth";
import {
  allRecords,
  allUsers,
  deleteRecord,
  importLegacy,
  saveRecord,
} from "../../../lib/school/store";
import { canMessage, canRead } from "../../../lib/school/policy";
import { emailConfig, saveEmail, sendEmail } from "../../../lib/school/email";
import { reminders } from "../../../lib/school/notifications";
export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    await importLegacy(user);
    const records = await allRecords(),
      users = await allUsers();
    const visible = records
      .filter((r) => canRead(user, r, records))
      .map((r) =>
        r.kind === "students" && user.role !== "admin"
          ? { ...r, data: { ...r.data, notes: "" } }
          : r,
      );
    const files = (
      await db()
        .prepare(
          "SELECT id,record_id,kind,name,type,size,created FROM school_files ORDER BY created DESC",
        )
        .all<{
          id: string;
          record_id: string;
          kind: string;
          name: string;
          type: string;
          size: number;
          created: string;
        }>()
    ).results
      .filter((f) => visible.some((r) => r.id === f.record_id))
      .map((f) => ({
        id: f.id,
        recordId: f.record_id,
        kind: f.kind,
        name: f.name,
        type: f.type,
        size: f.size,
        created: f.created,
      }));
    const notifications = (
      await db()
        .prepare(
          "SELECT * FROM school_notifications WHERE user_id=? ORDER BY created DESC LIMIT 200",
        )
        .bind(user.id)
        .all<{
          id: string;
          title: string;
          body: string;
          link: string;
          read: number;
          created: string;
        }>()
    ).results.map((n) => ({ ...n, read: !!n.read }));
    const directory = users
      .filter(
        (u) =>
          u.id === user.id ||
          user.role === "admin" ||
          canMessage(user, u, records) ||
          (u.role === "parent" &&
            u.studentIds.some((id) =>
              visible.some((r) => r.kind === "students" && r.id === id),
            )),
      )
      .map((u) =>
        user.role === "admin"
          ? u
          : {
              id: u.id,
              name: u.name,
              role: u.role,
              active: u.active,
              classIds: [],
              studentIds: [],
              email: "",
            },
      );
    const audit =
      user.role === "admin"
        ? (
            await db()
              .prepare(
                "SELECT * FROM school_audit ORDER BY created DESC LIMIT 100",
              )
              .all()
          ).results
        : [];
    const settings = (
      await db()
        .prepare("SELECT value FROM school_settings WHERE key='school'")
        .first<{ value: string }>()
    )?.value;
    return json({
      user,
      records: visible,
      users: directory,
      files,
      notifications,
      audit,
      settings: settings
        ? JSON.parse(settings)
        : { name: "Scola", currency: "MAD" },
      email:
        user.role === "admin"
          ? await emailConfig().then((c) => ({
              configured: !!c,
              provider: c?.provider ?? "resend",
              from: c?.from ?? "contact@schoolapp.space",
            }))
          : undefined,
      serverTime: now(),
    });
  } catch (e) {
    return responseError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const user = await requireUser(req);
    const input = await body(req);
    if (input.action === "email") {
      if (user.role !== "admin")
        throw new ApiError(403, "Administrateur requis.");
      return json(await saveEmail(input));
    }
    if (input.action === "email-test") {
      if (user.role !== "admin")
        throw new ApiError(403, "Administrateur requis.");
      await sendEmail(
        user.email,
        "Scola · Test email",
        "Votre service email Scola est connecté. / خدمة البريد الإلكتروني متصلة.",
      );
      return json({ ok: true });
    }
    if (input.action === "user") {
      if (user.role !== "admin")
        throw new ApiError(403, "Administrateur requis.");
      const records = await allRecords();
      const assignments = input.data as {
        classIds?: string[];
        studentIds?: string[];
      };
      if (
        !assignments ||
        !Array.isArray(assignments.classIds) ||
        !Array.isArray(assignments.studentIds) ||
        assignments.classIds.some(
          (id) => !records.some((r) => r.kind === "classes" && r.id === id),
        ) ||
        assignments.studentIds.some(
          (id) => !records.some((r) => r.kind === "students" && r.id === id),
        )
      )
        throw new ApiError(400, "Classe ou élève introuvable.");
      const result = await saveUser(user, input);
      const links = records
        .filter((r) => r.kind === "classes" || r.kind === "students")
        .map((r) => {
          const key = r.kind === "classes" ? "teacherIds" : "parentIds";
          const included =
            r.kind === "classes"
              ? result.role === "teacher" && result.classIds.includes(r.id)
              : result.role === "parent" && result.studentIds.includes(r.id);
          return db()
            .prepare(
              `UPDATE school_records SET data=json_set(data,'$.${key}',json((SELECT json_group_array(value) FROM (SELECT value FROM json_each(school_records.data,'$.${key}') WHERE value<>? UNION SELECT ? WHERE ?)))),version=version+1,updated=? WHERE id=? AND deleted=0 AND (? OR EXISTS(SELECT 1 FROM json_each(data,'$.${key}') WHERE value=?))`,
            )
            .bind(
              result.id,
              result.id,
              included ? 1 : 0,
              now(),
              r.id,
              included ? 1 : 0,
              result.id,
            );
        });
      if (links.length) await db().batch(links);
      return json(result);
    }
    if (input.action === "read") {
      await db()
        .prepare(
          "UPDATE school_notifications SET read=1 WHERE user_id=? AND (?='all' OR id=?)",
        )
        .bind(user.id, String(input.id), String(input.id))
        .run();
      return json({ ok: true });
    }
    if (input.action === "remind") {
      if (user.role !== "admin")
        throw new ApiError(403, "Administrateur requis.");
      return json(await reminders(user, await allRecords(), await allUsers()));
    }
    if (input.action === "settings") {
      if (user.role !== "admin")
        throw new ApiError(403, "Administrateur requis.");
      const data = input.data as { name?: string };
      if (
        !data ||
        typeof data.name !== "string" ||
        data.name.length < 1 ||
        data.name.length > 100
      )
        throw new ApiError(400, "Nom invalide.");
      await db()
        .prepare(
          "INSERT INTO school_settings (key,value) VALUES ('school',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .bind(JSON.stringify({ name: data.name, currency: "MAD" }))
        .run();
      return json({ ok: true });
    }
    return json(await saveRecord(user, input));
  } catch (e) {
    return responseError(e);
  }
}
export async function DELETE(req: Request) {
  try {
    checkOrigin(req);
    return json(await deleteRecord(await requireUser(req), await body(req)));
  } catch (e) {
    return responseError(e);
  }
}
