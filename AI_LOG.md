# AI Usage Log

## Tools used

- Claude Code (Anthropic) as a pair-programming agent for scaffolding, implementation, test authoring, and verification.
- The agent ran the toolchain directly: `pnpm`, `tsc`, `eslint`, `prettier`, `vitest`, `drizzle-kit`, `docker compose`, and `psql` for EXPLAIN.

## Representative prompts

- "Rebuild this Express + Postgres take-home as a production NestJS service with Drizzle, Zod, keyset pagination, and user-scoped access control. Keep the deterministic seed exact so tests assert real rows."
- "Implement the visibility rule as `owner_id = me OR EXISTS(resource_shares for me)` and make all three endpoints share one repository method. Explain the blast radius."
- "Add the index that the `resource_shares` primary key cannot serve for a `user_id` lookup, and prove it with EXPLAIN ANALYZE against a large dataset."
- "Raise coverage above 95% across all four metrics; only add tests that exercise real branches, not coverage padding."

## Where I accepted, rejected, or corrected AI output

- **Accepted:** the discriminated-union `VisibilityScope` that separates the policy decision from its SQL translation, and the keyset cursor encoding on `(created_at, id)`.
- **Rejected:** an initial seed reset using `TRUNCATE ... RESTART IDENTITY`. Because the seed assigns ids explicitly, identity restart was unnecessary, and a plain Drizzle `delete` in foreign-key order is clearer and avoids a destructive raw statement.
- **Corrected:** the first cache implementation connected lazily and fired the connection without awaiting it, which made a cache-hit test racy. Switched to eager connect with an offline queue so reads and the health ping are deterministic, and verified the degraded path by pointing at a dead Redis port.
- **Corrected:** the exception filter first read the request id from a typed-optional property the linter proved was always present; reworked it to read from an `unknown`-typed access so the optional narrowing is genuine.

## How I verified AI-generated code

- **SQL:** ran `EXPLAIN (ANALYZE, BUFFERS)` against a 50,030-row table seeded by `db:seed:bench`. Confirmed the shared-with-me lookup uses an Index Only Scan on `resource_shares_user_id_idx`, the owner-scoped query uses the composite index with no sort step, and the visibility query orders through the keyset index. Captured output is in `PR_DESCRIPTION.md`.
- **Tests:** every test runs against the real Postgres and Redis from `docker compose`. The access-control assertions check positive and negative cases, for example that a member sees a resource shared to them (id 1) and does not see a resource they neither own nor are shared (id 3). Coverage was checked file by file, and the two reachable uncovered branches were closed with tests rather than ignored.
- **Gates:** `tsc --noEmit`, `eslint` with zero warnings, `prettier --check`, the full `vitest` suite, and `nest build` all pass.
