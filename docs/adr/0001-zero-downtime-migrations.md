# ADR 0001: Zero-downtime schema and data migrations

## Status

Accepted.

## Context

Schema changes on a live database can take exclusive locks that block reads and writes. A naive `CREATE INDEX` on a large table holds an `ACCESS EXCLUSIVE`-adjacent lock long enough to stall traffic. The same risk applies to a larger effort such as moving a workload from one Postgres host to another with no downtime.

## Decision

Two mechanisms, both visible in this repository, and one operational pattern for larger cutovers.

### 1. Concurrent index creation, isolated from transactions

The migration runner in [src/database/scripts/migrate.ts](../../src/database/scripts/migrate.ts) wraps each migration in a transaction by default. A migration whose body contains the marker `@concurrent` is applied statement by statement, outside any transaction, because `CREATE INDEX CONCURRENTLY` cannot run inside one. The access-control and pagination indexes use this path in [drizzle/migrations/0002_access_control_indexes.sql](../../drizzle/migrations/0002_access_control_indexes.sql), so they build without blocking reads or writes.

### 2. Idempotent, tracked, ordered migrations

Migrations are tracked in a `_migrations` table and use `IF NOT EXISTS` and `IF EXISTS`, so a re-run or a partial failure is safe. Files apply in filename order.

### 3. Expand and contract for breaking changes

A change that would break existing readers or writers is split into steps that are each backward compatible:

1. Expand: add the new column, table, or index. Nullable or with a default. Online.
2. Backfill: populate the new shape in batches, never in one locking statement.
3. Dual-write: the application writes both the old and new shape while readers migrate.
4. Switch reads: point readers at the new shape once the backfill is verified.
5. Contract: drop the old shape after a safe window.

Each step ships as its own migration and its own deploy, so a rollback is always one step back.

## Applying this to a Supabase to Aurora Postgres cutover

The same discipline scales to a host migration with no downtime:

- Stand up logical replication from the source to Aurora and let it catch up.
- Validate row counts and checksums per table before any switch. A validation script that compares counts and a hash of each table is the gate, not a vibe.
- Cut writes over during a short, planned window using a connection-string switch behind the application's configuration, not a redeploy of business logic.
- Keep replication running in reverse for a rollback window.
- Rewrite ORM access behind the existing service-layer boundary, so query changes do not leak into controllers.

## Consequences

- Index changes on large tables are safe to ship during traffic.
- Every migration is reversible in effect, either by a working down path or a forward inverse migration.
- The cost is discipline: breaking changes take several small deploys instead of one. That cost is the point.
