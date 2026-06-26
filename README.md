# Resource Access API

A REST API over PostgreSQL that lists resources with user-scoped visibility, type and status filtering, and keyset pagination. Built with NestJS, Drizzle ORM, and Zod.

## Reviewer guide

A fast map from concern to where it lives.

| Concern | Where to look |
|---------|---------------|
| Access-control rule (own or shared) | [src/resources/access-policy.ts](src/resources/access-policy.ts), [src/resources/resources.repository.ts](src/resources/resources.repository.ts) |
| The shared data path and its blast radius | [src/resources/resources.repository.ts](src/resources/resources.repository.ts), [src/resources/resources.service.ts](src/resources/resources.service.ts) |
| Keyset pagination | [src/resources/pagination.ts](src/resources/pagination.ts) |
| Request and response validation | [src/resources/dto](src/resources/dto), [src/config/env.schema.ts](src/config/env.schema.ts) |
| Index strategy and SQL | [drizzle/migrations](drizzle/migrations), [PR_DESCRIPTION.md](PR_DESCRIPTION.md) |
| Auth boundary | [src/auth/auth.guard.ts](src/auth/auth.guard.ts) |
| Error shape (RFC 7807) | [src/common/filters/all-exceptions.filter.ts](src/common/filters/all-exceptions.filter.ts) |
| Observability (logs, metrics, traces) | [src/app.module.ts](src/app.module.ts), [src/metrics](src/metrics), [src/observability](src/observability), [src/health](src/health) |
| Authentication (header stub and JWT) | [src/auth/auth.guard.ts](src/auth/auth.guard.ts), [src/auth/jwt-verifier.ts](src/auth/jwt-verifier.ts) |
| OWASP API Top 10 mapping | [docs/security-owasp.md](docs/security-owasp.md) |
| Row-level security mapping | [docs/rls.md](docs/rls.md) |
| Zero-downtime migrations | [docs/adr/0001-zero-downtime-migrations.md](docs/adr/0001-zero-downtime-migrations.md) |
| Tests | [test/app.e2e-test.ts](test/app.e2e-test.ts) and the `*.test.ts` files beside each unit |
| Design rationale | [Decisions](#decisions) below |

## Stack

NestJS, TypeScript (strict), Drizzle ORM, PostgreSQL, Redis, Zod with `nestjs-zod`, Swagger, pino, Prometheus, OpenTelemetry, JWT via `jose`, Docker, PNPM.

## Prerequisites

- Node.js 24+
- PNPM 11+
- Docker

## Quickstart

```bash
cp -f .env.example .env
pnpm install
docker compose up -d
pnpm run db:migrate
pnpm run db:seed
pnpm run start:dev
```

The API serves on `http://localhost:3000`. Swagger UI is at `http://localhost:3000/docs`.

Migrations and seeds never run automatically. They are explicit commands so an operator always controls when schema and data change.

If ports 5432 or 6379 are already in use locally, set `POSTGRES_PORT` and `REDIS_PORT` in `.env` and point `DATABASE_URL` and `REDIS_URL` at them.

## Endpoints

All three listing endpoints share a single data-access function and scope to the authenticated caller. The caller is identified by the `x-user-id` header (a stand-in for real authentication).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/resources` | Resources visible to the caller, filterable by `type` and `status`, keyset-paginated |
| GET | `/resources/recent` | The ten most recently created visible resources |
| GET | `/users/:userId/resources` | Resources owned by a user; caller must be that user or an admin |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe (database and Redis) |

```bash
curl -H 'x-user-id: 2' 'http://localhost:3000/resources?type=doc&status=published&limit=10'
```

## Folder structure

```
src/
  auth/        identity resolution, guard, current-user decorator
  cache/       Redis-backed best-effort response cache
  common/      RFC 7807 exception filter
  config/      Zod environment schema and validation
  database/    Drizzle schema, module, migration runner, seeds
  health/      liveness and readiness indicators
  resources/   access policy, pagination, repository, service, controller, DTOs
drizzle/
  migrations/  hand-authored SQL migrations
test/          end-to-end suite and setup
```

## Development

| Command | Purpose |
|---------|---------|
| `pnpm run start:dev` | Run with reload |
| `pnpm run db:migrate` | Apply pending SQL migrations |
| `pnpm run db:seed` | Load the deterministic functional seed |
| `pnpm run db:seed:bench` | Load a large randomized dataset for EXPLAIN evidence |
| `pnpm run lint` | ESLint, zero warnings |
| `pnpm run format` | Prettier check |
| `pnpm run typecheck` | `tsc --noEmit` |

## Migrations

Migrations are plain SQL under [drizzle/migrations](drizzle/migrations), applied in filename order by the runner in [src/database/scripts/migrate.ts](src/database/scripts/migrate.ts). Applied migrations are tracked in a `_migrations` table so the command is safe to run repeatedly. A migration whose body contains the marker `@concurrent` runs its statements outside a transaction so `CREATE INDEX CONCURRENTLY` can build indexes without locking the table.

```bash
pnpm run db:migrate
```

## Seeds

The functional seed in [src/database/scripts/seed.ts](src/database/scripts/seed.ts) is deterministic: fixed ids, counts, and shares, so tests assert exact rows. The benchmark seed in [src/database/scripts/seed-bench.ts](src/database/scripts/seed-bench.ts) loads tens of thousands of rows with ids at or above 1,000,000 so the query planner exercises the indexes. Volume scales with `SEED_SCALE`.

```bash
pnpm run db:seed
SEED_SCALE=1 pnpm run db:seed:bench
```

## Testing and coverage

Unit tests sit beside the code they cover. Integration and end-to-end tests in [test](test) run against the real Postgres and Redis from `docker compose`, not mocks.

```bash
docker compose up -d
pnpm run db:migrate
pnpm test
pnpm run test:cov
```

Coverage is enforced at 95% for statements, branches, functions, and lines. Declarative table definitions, thin controllers, and Terminus health glue are excluded from the metric because their lines are decorator and framework artifacts rather than logic; all of them are still exercised by the end-to-end suite.

## Build

```bash
pnpm run build
node dist/main.js
```

## Docker

`docker compose up -d` starts PostgreSQL and Redis. The application image is built from the multi-stage [Dockerfile](Dockerfile), which installs production dependencies, compiles, prunes dev dependencies, and runs as a non-root user with a health check.

## Observability

Three signals, pipeline-ready.

- **Logs:** structured JSON via pino. Every request gets an `x-request-id` (honored from the inbound header or generated) bound to the logger and echoed on the response, so a log line and any error share a correlation id. The `x-user-id`, `authorization`, and `cookie` headers are redacted.
- **Metrics:** a Prometheus endpoint at `/metrics` exposes default process metrics plus RED-style HTTP metrics (`http_requests_total`, `http_request_duration_seconds`) labeled by method, route, and status. Scrape it with Prometheus or any OpenMetrics-compatible collector. Toggle with `METRICS_ENABLED`.
- **Traces:** OpenTelemetry auto-instrumentation for HTTP, Postgres, and Redis, exporting over OTLP. Off by default; enable with `OTEL_ENABLED=true` and point `OTEL_EXPORTER_OTLP_ENDPOINT` at a collector. See [src/observability/tracing.ts](src/observability/tracing.ts).

A full local observability stack ships in `docker-compose.yml` behind a profile: an OpenTelemetry Collector, Prometheus, Grafana Tempo, and Grafana. Bring it up alongside the datastores with:

```bash
docker compose --profile observability up -d
```

| Service | URL | Purpose |
|---------|-----|---------|
| Grafana | http://localhost:3001 | Dashboards over Prometheus and Tempo (anonymous admin) |
| Prometheus | http://localhost:9090 | Scrapes the app's `/metrics` |
| Tempo | http://localhost:3200 | Trace storage |
| OTel Collector | localhost:4317 / 4318 | Receives OTLP traces from the app |

With the stack up, run the app with `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` so traces flow to the collector and into Tempo. Collector, Prometheus, Tempo, and Grafana config live under [deploy/](deploy).

## Authentication

Identity resolves in a single guard, selected by `AUTH_MODE`.

- `header` (default): reads `x-user-id` and resolves the user from the database. A development stand-in matching the baseline contract.
- `jwt`: verifies a Bearer token's signature, issuer, audience, and expiry through a remote JWKS (production) or a shared secret (local), then maps the `sub` and `role` claims to the request identity. See [src/auth/jwt-verifier.ts](src/auth/jwt-verifier.ts).

The rest of the system depends only on the resolved identity, so switching modes touches nothing downstream. It is a standard JWT-based auth path.

## Performance

Measured with autocannon, 50 connections for 10 seconds against `GET /resources?limit=20` on the local stack with caching enabled:

| Metric | Value |
|--------|-------|
| Throughput | ~6,000 req/sec, 60k requests in 10s |
| Latency p50 | 7 ms |
| Latency p97.5 | 15 ms |
| Latency p99 | 20 ms |

Reproduce with the app running and a raised `RATE_LIMIT_MAX`:

```bash
pnpm run loadtest
```

Query-level evidence (`EXPLAIN ANALYZE` showing index usage, no sequential scans) is in [PR_DESCRIPTION.md](PR_DESCRIPTION.md).

## Security posture

- Helmet sets secure response headers.
- CORS origins are configurable via `CORS_ORIGINS`.
- Rate limiting via `@nestjs/throttler`, configured by `RATE_LIMIT_TTL_MS` and `RATE_LIMIT_MAX`.
- Errors are RFC 7807 `application/problem+json`; internal failures never leak a stack trace or message.
- Environment is validated at startup and fails fast on a missing or malformed variable.
- The access-control task closes a Broken Object Level Authorization gap. The full OWASP API Security Top 10 mapping is in [docs/security-owasp.md](docs/security-owasp.md), and the row-level-security model and its Postgres policy equivalent is in [docs/rls.md](docs/rls.md).

## Decisions

Each decision below states what was chosen and why.

- **NestJS with dependency injection.** Guards, interceptors, pipes, and filters give first-class places for cross-cutting concerns (authentication, validation, logging, error mapping) and keep controllers thin. Modules draw clear boundaries and make the access-control logic independently testable.
- **Drizzle as the only ORM.** Type-safe, explicit queries with a single typed source of truth in [src/database/schema.ts](src/database/schema.ts). No hand-built query strings; no second data-access path.
- **Zod with `nestjs-zod`.** One schema validates the request, validates the response, and generates the OpenAPI shape, so validation and documentation cannot drift apart.
- **pino with per-request ids.** Structured logs are pipeline-ready and request ids make a request traceable across log lines and errors. This maps to the observability requirement.
- **Explicit, non-automatic migrations and seeds.** Operators decide when schema and data change. Nothing mutates the database on container start or app boot.
- **Keyset pagination over offset.** Pagination is ordered on `(created_at, id)` and backed by an index, so it stays fast on deep pages as the table grows. Offset pagination degrades because the database still scans skipped rows.
- **Access control as `owner_id = me OR EXISTS(share)`.** `EXISTS` short-circuits and avoids the row multiplication a join would cause. The rule lives in [src/resources/access-policy.ts](src/resources/access-policy.ts) and is applied in the one shared repository method, so all three endpoints inherit it.
- **Admins bypass scoping.** Decided once in the policy rather than scattered across handlers.
- **`GET /users/:userId/resources` is self-or-admin.** A member may list only their own resources; an admin may list anyone's. A member asking for another user's resources gets 403. This closes the enumeration hole in the baseline. The rejected alternative, returning the viewer-visible intersection, conflates "owned by the target" with "visible to the viewer" and surprises callers.
- **401 on unauthenticated scoped requests.** A missing, malformed, or unknown `x-user-id` is rejected rather than served an empty list, so "no identity" is distinct from "no results".
- **Index choices.** `resource_shares(user_id)` serves the shared-with-me lookup that the table's primary key cannot, since its leading column is `resource_id`. `(created_at, id)` and `(owner_id, created_at, id)` back keyset ordering for the global and owner-scoped paths. Each is justified with `EXPLAIN ANALYZE` in [PR_DESCRIPTION.md](PR_DESCRIPTION.md).
- **Transactions.** Multi-statement migrations run inside a transaction; the concurrent-index migration runs outside one because `CREATE INDEX CONCURRENTLY` requires it.
- **Redis response cache.** Hot read paths are cached per user and per query with a configurable TTL. The cache is best-effort: a Redis outage logs and falls through to the database, never failing a request.
- **Three observability signals, not just logs.** pino for logs, Prometheus `/metrics` for RED metrics, and OpenTelemetry for traces across HTTP, Postgres, and Redis. Metrics and traces are env-toggleable so they cost nothing when off. A local Grafana, Prometheus, and Tempo stack ships in docker-compose for visualizing all three.
- **Pluggable authentication via `AUTH_MODE`.** The header stub and a JWKS/JWT verifier sit behind one guard interface. The system depends only on the resolved identity, so moving from the stub to real JWTs is a configuration change, not a rewrite.

## License

MIT.
