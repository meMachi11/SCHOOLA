import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const students = sqliteTable("students", {
  id: text("id").primaryKey(),
  data: text("data").notNull(),
  updated: text("updated").notNull(),
});
export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("documents_student_idx").on(t.studentId)],
);
export const schoolRecords = sqliteTable(
  "school_records",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    data: text("data").notNull(),
    version: integer("version").notNull().default(1),
    deleted: integer("deleted").notNull().default(0),
    authorId: text("author_id").notNull(),
    created: text("created").notNull(),
    updated: text("updated").notNull(),
  },
  (t) => [index("school_records_kind_deleted").on(t.kind, t.deleted)],
);
export const schoolUsers = sqliteTable("school_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  classIds: text("class_ids").notNull().default("[]"),
  studentIds: text("student_ids").notNull().default("[]"),
  active: integer("active").notNull().default(1),
  identityId: text("identity_id").unique(),
  passwordHash: text("password_hash"),
  created: text("created").notNull(),
});
export const schoolSessions = sqliteTable("school_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => schoolUsers.id),
  expires: text("expires").notNull(),
  created: text("created").notNull(),
});
export const schoolResets = sqliteTable("school_resets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => schoolUsers.id),
  expires: text("expires").notNull(),
  used: integer("used").notNull().default(0),
});
export const schoolAudit = sqliteTable(
  "school_audit",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").notNull(),
    action: text("action").notNull(),
    target: text("target").notNull(),
    created: text("created").notNull(),
  },
  (t) => [index("school_audit_created").on(t.created)],
);
export const schoolNotifications = sqliteTable(
  "school_notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => schoolUsers.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    link: text("link").notNull(),
    read: integer("read").notNull().default(0),
    created: text("created").notNull(),
  },
  (t) => [index("school_notifications_user").on(t.userId, t.created)],
);
export const schoolFiles = sqliteTable(
  "school_files",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id").notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    size: integer("size").notNull(),
    created: text("created").notNull(),
    authorId: text("author_id").notNull(),
  },
  (t) => [index("school_files_record").on(t.recordId)],
);
export const schoolPush = sqliteTable("school_push", {
  endpoint: text("endpoint").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => schoolUsers.id),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
});
export const schoolSettings = sqliteTable("school_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
export const schoolMutations = sqliteTable("school_mutations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  result: text("result").notNull(),
  created: text("created").notNull(),
});
export const schoolRateLimits = sqliteTable("school_rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  expires: text("expires").notNull(),
});
