-- 0002_access_control_indexes.sql
-- @concurrent
-- Performance indexes for the access-control and pagination paths.
--
-- These use CREATE INDEX CONCURRENTLY so the migration takes no
-- ACCESS EXCLUSIVE lock and can run against a live table without blocking
-- reads or writes. CONCURRENTLY cannot run inside a transaction block, so the
-- migration runner applies any file marked `@concurrent` statement by
-- statement, outside a transaction.

-- "Shared with me" lookups filter resource_shares by user_id. The table PK is
-- (resource_id, user_id), whose leading column is resource_id, so it cannot
-- serve a user_id predicate. This index does.
CREATE INDEX CONCURRENTLY IF NOT EXISTS resource_shares_user_id_idx
  ON resource_shares(user_id);

-- Keyset pagination orders by (created_at DESC, id DESC) across the whole table.
CREATE INDEX CONCURRENTLY IF NOT EXISTS resources_created_at_id_idx
  ON resources(created_at DESC, id DESC);

-- Owner-scoped listing plus keyset pagination for GET /users/:userId/resources.
CREATE INDEX CONCURRENTLY IF NOT EXISTS resources_owner_created_at_id_idx
  ON resources(owner_id, created_at DESC, id DESC);

-- Combined type/status filtering on GET /resources.
CREATE INDEX CONCURRENTLY IF NOT EXISTS resources_type_status_idx
  ON resources(type, status);
