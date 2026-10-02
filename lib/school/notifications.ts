import { isDemoId, isDemoRecord } from "./demo-marker";
import { db } from "../server";
import { now, userFrom, type UserRow } from "./auth";
import { canRead } from "./policy";
import { type RecordItem, type User } from "./model";
import { pushUser } from "./push";
export async function deliver(
  user: User,
  id: string,
  title: string,
  body: string,
  link: string,
) {
  if (isDemoId(user.id)) return;
  const r = await db()
    .prepare(
      "INSERT OR IGNORE INTO school_notifications (id,user_id,title,body,link,created) VALUES (?,?,?,?,?,?)",
    )
    .bind(id, user.id, title, body.slice(0, 500), link, now())
    .run();
  if (r.meta.changes) await pushUser(user.id, title, body.slice(0, 150), link);
}
export async function notifyChange(
  actor: User,
  record: RecordItem,
  old?: RecordItem,
) {
  if (isDemoRecord(record)) return;
  if (
    ![
      "attendance",
      "homework",
      "grades",
      "announcements",
      "messages",
      "payments",
    ].includes(record.kind)
  )
    return;
  if (
    record.kind === "attendance" &&
    !["absent", "late"].includes(String(record.data.status))
  )
    return;
  if (record.kind === "attendance" && old?.data.status === record.data.status)
    return;
  if (
    record.kind === "announcements" &&
    String(record.data.publishDate) > now().slice(0, 10)
  )
    return;
  const users = (
    await db()
      .prepare("SELECT * FROM school_users WHERE active=1")
      .all<UserRow>()
  ).results.map(userFrom);
  const raw = (
    await db().prepare("SELECT * FROM school_records WHERE deleted=0").all<{
      id: string;
      kind: RecordItem["kind"];
      data: string;
      version: number;
      author_id: string;
      created: string;
      updated: string;
    }>()
  ).results;
  const records = raw.map((r) => ({
    id: r.id,
    kind: r.kind,
    data: JSON.parse(r.data),
    version: r.version,
    authorId: r.author_id,
    created: r.created,
    updated: r.updated,
  }));
  const titles = {
    attendance: "Présence / الحضور",
    homework: "Nouveau devoir / واجب جديد",
    grades: "Nouvelle note / نقطة جديدة",
    announcements: "Annonce / إعلان",
    messages: "Nouveau message / رسالة جديدة",
    payments: "Paiement enregistré / تم تسجيل الدفع",
  };
  const title = titles[record.kind as keyof typeof titles];
  const body =
    record.kind === "messages"
      ? "Vous avez reçu un message. / توصلتم برسالة."
      : String(
          record.data.title ??
            (record.kind === "attendance"
              ? "Le statut de présence a changé. / تغيرت حالة الحضور."
              : "Votre dossier a été mis à jour. / تم تحديث ملفكم."),
        );
  for (const user of users) {
    if (user.id === actor.id || !canRead(user, record, records)) continue;
    if (record.kind === "messages" && user.id !== record.data.recipientId)
      continue;
    if (record.kind === "attendance" && user.role !== "parent") continue;
    await deliver(
      user,
      `${record.id}:${record.version}:${user.id}`,
      title,
      body,
      record.kind,
    );
  }
}
export async function reminders(
  actor: User,
  records: RecordItem[],
  users: User[],
) {
  const today = now().slice(0, 10);
  let count = 0;
  for (const invoice of records.filter(
    (r) =>
      r.kind === "invoices" && !isDemoRecord(r) && String(r.data.due) < today,
  )) {
    const paid = records
      .filter((p) => p.kind === "payments" && p.data.invoiceId === invoice.id)
      .reduce((sum, p) => sum + Number(p.data.amount), 0);
    if (paid >= Number(invoice.data.amount)) continue;
    for (const user of users.filter(
      (u) =>
        u.active &&
        u.role === "parent" &&
        u.studentIds.includes(String(invoice.data.studentId)),
    )) {
      await deliver(
        user,
        `reminder:${invoice.id}:${today}:${user.id}`,
        "Scolarité / رسوم الدراسة",
        "Une facture est arrivée à échéance. / حان موعد دفع فاتورة.",
        "invoices",
      );
      count++;
    }
  }
  await db()
    .prepare(
      "INSERT INTO school_audit (id,actor_id,action,target,created) VALUES (?,?,?,?,?)",
    )
    .bind(crypto.randomUUID(), actor.id, "fees.remind", String(count), now())
    .run();
  return { count };
}
