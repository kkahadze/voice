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

// Server-only orchestration state. Never part of browser learning-record sync.
export const lessonDirectors = sqliteTable('lesson_directors', {
  userId: text('user_id').notNull(),
  liveId: text('live_id').notNull(),
  agentId: text('agent_id'),
  instructions: text('instructions').notNull(),
  status: text('status').notNull().default('idle'),
  revision: integer('revision').notNull().default(0),
  delegationId: text('delegation_id'),
  result: text('result'),
  calls: integer('calls').notNull().default(0),
  createdAt: integer('created_at').notNull(),
}, table => [primaryKey({columns: [table.userId, table.liveId]})]);
