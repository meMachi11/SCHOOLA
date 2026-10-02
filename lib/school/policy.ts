import { type Kind, type RecordItem, type User, type Values } from "./model";
export function classesFor(user: User, records: RecordItem[]): string[] {
  if (user.role === "teacher") return user.classIds;
  return records
    .filter(
      (r) =>
        r.kind === "students" &&
        (user.role === "student"
          ? user.studentIds.slice(0, 1)
          : user.studentIds
        ).includes(r.id),
    )
    .map((r) => String(r.data.classId));
}
export function canRead(
  user: User,
  r: RecordItem,
  records: RecordItem[],
): boolean {
  if (user.role === "admin") return true;
  const ownClasses = classesFor(user, records),
    ownStudent = (id: unknown) =>
      (user.role === "student"
        ? user.studentIds.slice(0, 1)
        : user.studentIds
      ).includes(String(id));
  if (["subjects", "levels", "years"].includes(r.kind)) return true;
  if (r.kind === "students")
    return user.role === "teacher"
      ? ownClasses.includes(String(r.data.classId))
      : ownStudent(r.id);
  if (r.kind === "classes") return ownClasses.includes(r.id);
  if (r.kind === "messages")
    return r.authorId === user.id || r.data.recipientId === user.id;
  if (r.kind === "invoices")
    return user.role === "parent" && ownStudent(r.data.studentId);
  if (r.kind === "payments") {
    const invoice = records.find(
      (i) => i.kind === "invoices" && i.id === r.data.invoiceId,
    );
    return !!invoice && canRead(user, invoice, records);
  }
  if (r.kind === "feeSchedules") return false;
  if (r.kind === "attendance")
    return user.role === "teacher"
      ? ownClasses.includes(String(r.data.classId))
      : ownStudent(r.data.studentId);
  if (r.kind === "grades") {
    if (user.role !== "teacher") return ownStudent(r.data.studentId);
    const assessment = records.find((a) => a.id === r.data.assessmentId);
    return !!assessment && ownClasses.includes(String(assessment.data.classId));
  }
  if (
    r.kind === "announcements" &&
    user.role === "teacher" &&
    ownClasses.includes(String(r.data.classId))
  )
    return true;
  if (r.kind === "announcements")
    return (
      (r.data.role === "all" || r.data.role === user.role) &&
      (!r.data.classId || ownClasses.includes(String(r.data.classId))) &&
      String(r.data.publishDate) <= new Date().toISOString().slice(0, 10)
    );
  if (r.kind === "events")
    return !r.data.classId || ownClasses.includes(String(r.data.classId));
  return ownClasses.includes(String(r.data.classId));
}
export function canWrite(
  user: User,
  kind: Kind,
  data: Values,
  records: RecordItem[],
): boolean {
  if (user.role === "admin") return true;
  if (kind === "messages") return true;
  if (
    user.role !== "teacher" ||
    ![
      "attendance",
      "homework",
      "assessments",
      "grades",
      "announcements",
    ].includes(kind)
  )
    return false;
  if (kind === "grades") {
    const a = records.find(
      (a) => a.kind === "assessments" && a.id === data.assessmentId,
    );
    return !!a && user.classIds.includes(String(a.data.classId));
  }
  return user.classIds.includes(String(data.classId));
}
export function canMessage(
  sender: User,
  recipient: User,
  records: RecordItem[],
): boolean {
  if (!recipient.active || sender.id === recipient.id) return false;
  if (sender.role === "admin" || recipient.role === "admin") return true;
  const left = classesFor(sender, records),
    right = classesFor(recipient, records);
  return (
    (sender.role === "teacher" || recipient.role === "teacher") &&
    left.some((id) => right.includes(id))
  );
}
