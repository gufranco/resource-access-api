# PR Write-up

## Summary

Makes `GET /resources` production-ready with filtering, keyset pagination, and input validation, and introduces user-scoped visibility on the shared data path so a caller sees only resources they own or that are shared with them. The service is built on NestJS, Drizzle, and Zod.

## Changes

- **Shared data path.** A single repository method backs all three listing endpoints. It composes the visibility predicate, owner scoping, type and status filters, and a keyset window into one query, so the access-control rule cannot be bypassed by any caller.
- **Access control.** Members see `owner_id = me OR EXISTS(a row in resource_shares for me)`. Admins bypass scoping. `GET /users/:userId/resources` is restricted to the user themselves or an admin, which closes a Broken Object Level Authorization (OWASP API1:2023) hole where any caller could read another user's resources.
- **Filtering and validation.** `type` and `status` are validated against an allowlist; unknown query parameters, non-positive limits, and malformed cursors return 400. Validation is Zod end to end, including the `:userId` path parameter.
- **Pagination.** Keyset pagination ordered on `(created_at, id)` with a default and hard-capped page size. The response is a `{ data, pageInfo }` envelope with an opaque `nextCursor`.
- **Schema and indexes.** Added `CHECK` constraints on `type` and `status`, an index on `resource_shares(user_id)`, and `(created_at, id)` plus `(owner_id, created_at, id)` indexes on `resources`. The access-control and pagination indexes are created with `CREATE INDEX CONCURRENTLY` in a separate migration so they build without locking the table.
- **Hardening.** Helmet, configurable CORS, rate limiting, RFC 7807 error responses, startup environment validation, graceful shutdown, structured pino logging with request ids, and liveness and readiness health checks.
- **Observability.** Prometheus `/metrics` with RED-style HTTP metrics and OpenTelemetry tracing across HTTP, Postgres, and Redis, both env-toggleable.
- **Authentication.** A pluggable guard selected by `AUTH_MODE`: the `x-user-id` stub for development and a JWKS/JWT verifier for production, the latter mapping to Supabase tokens.
- **Docs.** OWASP API Top 10 mapping, a row-level-security model with Postgres and Supabase equivalents, and a zero-downtime migration ADR under `docs/`.

## Testing

Automated tests run against real PostgreSQL and Redis, not mocks. Unit tests cover the pure logic (access policy, pagination, environment schema, cache, error filter, auth guard, user directory). The end-to-end suite in `test/app.e2e-test.ts` drives the HTTP surface.

- **Automated tests:** 59 tests. Coverage is 100% lines, 99.4% statements, 97.5% functions, 96.5% branches, enforced at a 95% gate.
- **Edge cases exercised:** owner vs shared vs neither, admin vs member, self vs other-user queries, missing and malformed and unknown `x-user-id` (401), invalid type and unknown query parameters and non-positive limit and malformed cursor (400), member querying another user (403), full keyset walk with no duplicates in descending order, and filtered owner queries.
- **How to verify:**

```bash
docker compose up -d
pnpm run db:migrate
pnpm run db:seed
pnpm run test:cov
```

### Performance and regression

The shared path is index-backed at scale. Evidence below is `EXPLAIN (ANALYZE, BUFFERS)` against a 50,030-row `resources` table and 5,005 shares loaded by `pnpm run db:seed:bench`.

The shared-with-me lookup uses the index added precisely because the `resource_shares` primary key `(resource_id, user_id)` cannot serve a `user_id` predicate:

```
Index Only Scan using resource_shares_user_id_idx on resource_shares (rows=2)
  Index Cond: (user_id = 2)
  Heap Fetches: 0
Execution Time: 0.062 ms
```

The owner-scoped keyset query uses the composite index and needs no sort step:

```
Limit
  ->  Index Scan using resources_owner_created_at_id_idx on resources (rows=21)
        Index Cond: (owner_id = 2)
```

The full member-visibility query orders through the keyset index and resolves the share check with a bitmap scan on the `user_id` index:

```
Limit
  ->  Index Scan using resources_created_at_id_idx on resources (rows=21)
        Filter: ((owner_id = 2) OR (hashed SubPlan 2))
        SubPlan 2
          ->  Bitmap Index Scan on resource_shares_user_id_idx
                Index Cond: (user_id = 2)
Execution Time: 0.064 ms
```

No sequential scans on the hot paths; all three plans are sub-millisecond at 50k rows. The keyset index keeps ordering off the sort path, which is what keeps deep pages cheap.

HTTP load test with autocannon, 50 connections for 10 seconds against `GET /resources?limit=20` with caching enabled: roughly 6,000 requests per second, 60,000 requests in 10 seconds, latency p50 7 ms, p97.5 15 ms, p99 20 ms. Reproduce with `pnpm run loadtest` while the app runs with a raised `RATE_LIMIT_MAX`.

## Trade-offs

- The `x-user-id` header is kept as the identity source to match the baseline contract. The guard depends only on a resolved `UserContext`, so swapping in a JWT or JWKS verifier is a contained change.
- Responses are standardized to a paginated envelope for all three endpoints, including `/resources/recent`. This trades exact baseline response shape for a consistent contract.
- Over-max page sizes are clamped to the maximum rather than rejected, which is friendlier to clients than a 400 on an otherwise valid request.
- The response cache is best-effort with a short TTL. Because the API is read-only there are no write paths to invalidate; if writes are added later, the cache keys are structured to invalidate per user and per query.

## Open questions

- Should `GET /users/:userId/resources` return resources owned by the target, as implemented, or resources visible to the target? The first is the least surprising reading of the path; the second would need a product decision.
- Is admin "see everything" the desired behavior, or should admins be scoped to a tenant or organization once one exists?
