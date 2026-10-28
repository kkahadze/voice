import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const learningRecords = sqliteTable('learning_records', {
  userId: text('user_id').notNull(),
  namespace: text('namespace').notNull(),
  id: text('id').notNull(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, table => [primaryKey({columns: [table.userId, table.namespace, table.id]})]);

// Retain accepted changes as well as current state. Retried uploads are idempotent.
export const learningEvents = sqliteTable('learning_events', {
  userId: text('user_id').notNull(),
  id: text('id').notNull(),
  payload: text('payload').notNull(),
  createdAt: integer('created_at').notNull(),
}, table => [primaryKey({columns: [table.userId, table.id]})]);

export const learningVersions = sqliteTable('learning_versions', {
  userId: text('user_id').primaryKey(),
  revision: integer('revision').notNull().default(0),
});
