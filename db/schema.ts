import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const students = sqliteTable('students', {id:text('id').primaryKey(), data:text('data').notNull(), updated:text('updated').notNull()});
export const documents = sqliteTable('documents', {id:text('id').primaryKey(), studentId:text('student_id').notNull().references(()=>students.id), name:text('name').notNull(), type:text('type').notNull(), size:integer('size').notNull(), created:text('created').notNull()},t=>[index('documents_student_idx').on(t.studentId)]);
