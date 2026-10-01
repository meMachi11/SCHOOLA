import { z } from "zod";
export const roles = ["admin", "teacher", "parent", "student"] as const;
export type Role = (typeof roles)[number];
export const kinds = [
  "students",
  "levels",
  "classes",
  "subjects",
  "years",
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
] as const;
export type Kind = (typeof kinds)[number];
export type Values = Record<string, string | number | boolean | string[]>;
export type RecordItem = {
  id: string;
  kind: Kind;
  data: Values;
  version: number;
  created: string;
  updated: string;
  authorId: string;
};
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  classIds: string[];
  studentIds: string[];
  active: boolean;
  identityId?: string;
};
export type Notice = {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  created: string;
};
export type SchoolFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: string;
  recordId: string;
  created: string;
};
const text = z.string().trim().min(1).max(200);
const optional = z.string().max(5000).default("");
const id = z.string().max(80).default("");
const ids = z.array(z.string().min(1).max(80)).max(100).default([]);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Date invalide");
const cents = z.number().int().min(1).max(100000000);
export const schemas = {
  students: z.object({
    first: text,
    last: text,
    dob: z.union([date, z.literal("")]).default(""),
    gender: z.enum(["F", "M"]),
    classId: id,
    yearId: id,
    status: z.enum(["active", "pending", "archived"]),
    address: optional,
    notes: optional,
    parentIds: ids,
  }),
  levels: z.object({ name: text, order: z.number().int().min(0).max(30) }),
  classes: z.object({
    name: text,
    levelId: id,
    yearId: id,
    teacherIds: ids,
    capacity: z.number().int().min(1).max(200),
  }),
  subjects: z.object({ name: text, coefficient: z.number().min(0.1).max(20) }),
  years: z
    .object({ name: text, start: date, end: date, active: z.boolean() })
    .refine((v) => v.end >= v.start, "La fin précède le début"),
  events: z
    .object({
      title: text,
      start: date,
      end: date,
      classId: id,
      description: optional,
    })
    .refine((v) => v.end >= v.start, "La fin précède le début"),
  attendance: z.object({
    studentId: text,
    classId: text,
    date,
    session: text,
    status: z.enum(["present", "absent", "late", "excused"]),
    minutes: z.number().int().min(0).max(600),
    note: optional,
  }),
  homework: z.object({
    title: text,
    classId: text,
    subjectId: text,
    instructions: optional,
    due: date,
  }),
  assessments: z.object({
    title: text,
    classId: text,
    subjectId: text,
    date,
    term: z.enum(["T1", "T2", "T3"]),
    maximum: z.number().min(1).max(1000),
    coefficient: z.number().min(0.1).max(20),
  }),
  grades: z.object({
    studentId: text,
    assessmentId: text,
    score: z.number().min(0).max(1000),
    comment: optional,
  }),
  feeSchedules: z.object({
    title: text,
    classId: id,
    yearId: text,
    amount: cents,
    due: date,
  }),
  invoices: z.object({
    studentId: text,
    scheduleId: id,
    title: text,
    amount: cents,
    due: date,
  }),
  payments: z.object({
    invoiceId: text,
    amount: cents,
    date,
    method: z.enum(["cash", "transfer", "card", "cheque"]),
    reference: optional,
  }),
  announcements: z.object({
    title: text,
    body: optional,
    classId: id,
    role: z.enum(["all", ...roles]),
    publishDate: date,
  }),
  messages: z.object({
    recipientId: text,
    body: z.string().trim().min(1).max(5000),
  }),
} satisfies Record<Kind, z.ZodType>;
export const userSchema = z.object({
  name: text,
  email: z
    .string()
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  role: z.enum(roles),
  classIds: ids,
  studentIds: ids,
  active: z.boolean(),
});
export const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .refine(
    (v) => /[a-zA-Z]/.test(v) && /\d/.test(v),
    "12 caractères, lettres et chiffres",
  );
export function dataString(r: RecordItem, key: string) {
  return String(r.data[key] ?? "");
}
export function weightedAverage(
  grades: RecordItem[],
  assessments: RecordItem[],
  subjects: RecordItem[],
  studentId: string,
  term?: string,
) {
  const perSubject = new Map<string, { sum: number; weight: number }>();
  for (const grade of grades.filter((g) => g.data.studentId === studentId)) {
    const a = assessments.find((a) => a.id === grade.data.assessmentId);
    if (!a || (term && a.data.term !== term)) continue;
    const key = dataString(a, "subjectId"),
      weight = Number(a.data.coefficient),
      maximum = Number(a.data.maximum);
    const item = perSubject.get(key) ?? { sum: 0, weight: 0 };
    item.sum += (Number(grade.data.score) / maximum) * 20 * weight;
    item.weight += weight;
    perSubject.set(key, item);
  }
  const rows = [...perSubject].map(([subjectId, v]) => ({
    subjectId,
    average: v.sum / v.weight,
    coefficient: Number(
      subjects.find((s) => s.id === subjectId)?.data.coefficient ?? 1,
    ),
  }));
  const weight = rows.reduce((s, v) => s + v.coefficient, 0);
  return {
    subjects: rows,
    average: weight
      ? rows.reduce((s, v) => s + v.average * v.coefficient, 0) / weight
      : null,
  };
}
