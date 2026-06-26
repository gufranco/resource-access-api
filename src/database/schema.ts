import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Typed source of truth for the schema. The SQL migrations under
 * `drizzle/migrations` are authored by hand to control index strategy and
 * zero-downtime concerns; this file stays in parity with their final state.
 */

export const RESOURCE_TYPES = ['doc', 'sheet', 'slide'] as const;
export const RESOURCE_STATUSES = ['draft', 'published', 'archived'] as const;
export const USER_ROLES = ['member', 'admin'] as const;

export const users = pgTable('users', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
});

export const resources = pgTable(
  'resources',
  {
    id: bigint('id', { mode: 'number' }).primaryKey(),
    ownerId: bigint('owner_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
    type: text('type').notNull(),
    status: text('status').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('resources_owner_id_idx').on(table.ownerId),
    index('resources_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
    index('resources_owner_created_at_id_idx').on(
      table.ownerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    index('resources_type_status_idx').on(table.type, table.status),
    check('resources_type_check', sql`${table.type} IN ('doc', 'sheet', 'slide')`),
    check('resources_status_check', sql`${table.status} IN ('draft', 'published', 'archived')`),
  ],
);

export const resourceShares = pgTable(
  'resource_shares',
  {
    resourceId: bigint('resource_id', { mode: 'number' })
      .notNull()
      .references(() => resources.id),
    userId: bigint('user_id', { mode: 'number' })
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.resourceId, table.userId] }),
    index('resource_shares_user_id_idx').on(table.userId),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type ResourceRow = typeof resources.$inferSelect;
export type ResourceShareRow = typeof resourceShares.$inferSelect;
