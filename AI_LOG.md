# AI Usage Log

I used AI tooling on this take-home, and this log is the honest account of how. The short version: I made the engineering and product decisions, I worked through the problem in deliberate steps, and I reviewed and verified everything that ended up in the repository. AI helped me move faster on scaffolding and first drafts; it did not make the calls.

## How I approached the problem

I started by reading the baseline carefully: the single shared `findResources` function, the three endpoints that depend on it, the auth stub, and the schema. Before writing anything I decided the two things that actually carry the grade here are judgment and SQL, so I planned the work around them rather than around boilerplate.

I worked in a deliberate order, one slice at a time, and only moved on once the slice was green:

1. First I nailed down the pure decisions, the visibility rule and the pagination math, as small functions with unit tests. I wanted the access-control logic provable without a database.
2. Then I built the data layer and decided the index strategy, checking my assumptions against real query plans rather than guessing.
3. Then I wired the NestJS app and wrote the end-to-end suite against real Postgres and Redis, because I did not want a green test that only proved a mock works.
4. Only after the core was solid did I add the production concerns: hardening, observability, auth, and the documentation.

At each step I read the diff, ran the gates myself, and decided whether the result was good enough before continuing.

## Tools

I used Claude Code (Anthropic) in the terminal as a fast pair for typing out scaffolding and first drafts of modules and tests. I kept Postgres and Redis running in Docker the whole time so that every test exercised the real integration. I ran the toolchain, `tsc`, `eslint`, `prettier`, `vitest`, `drizzle-kit`, and `psql` for the query plans, and I read the output myself before trusting any of it.

## The direction I gave

A handful of the instructions that did real work, which show the decisions I was steering toward:

- Rebuild the Express baseline as a production NestJS service with Drizzle, Zod, keyset pagination, and user-scoped access control, and keep the deterministic seed exact so the tests can assert real rows.
- Model the visibility rule as `owner_id = me OR EXISTS(a share for me)`, and route all three endpoints through one repository method so the rule cannot be bypassed. Spell out the blast radius across the three callers.
- For `GET /users/:userId/resources`, decide who may call it and what it returns, and write down the alternative I rejected and why.
- Add the index the `resource_shares` primary key cannot serve for a `user_id` lookup, and prove it with `EXPLAIN ANALYZE` against a large dataset, not the 30-row seed.
- Hold coverage at 95 percent per file across all four metrics, with real branch tests only, no padding and no lowering the bar.

## Decisions I made while reviewing the output

I treated every generated draft as a junior engineer's first pass: useful, but mine to accept, reject, or fix.

Accepted, because they matched what I wanted:

- Keeping the access-control decision in a pure function, separate from its SQL, so I could unit-test the rule directly. That separation was my call and it paid off in the tests.
- Encoding keyset pagination on `(created_at, id)` and exposing it as an opaque cursor.

Rejected:

- A first seed that reset state with `TRUNCATE ... RESTART IDENTITY CASCADE`. My seed assigns ids explicitly, so the identity reset was pointless and the raw destructive statement was not worth it. I replaced it with a plain Drizzle delete in foreign-key order.
- An end-to-end test for JWT mode that flipped `AUTH_MODE` through the environment inside a running process. I decided that was the wrong tool: the config is read once at startup, so the test was flaky for a reason that has nothing to do with the code. I covered the verifier and the guard with deterministic unit tests instead, which is the right level for that logic.

Corrected:

- The cache connected to Redis lazily without awaiting the connection, which made a cache-hit test race. I changed it to connect eagerly with an offline queue, and I added a test that points the cache at a dead port to prove it degrades to the database instead of failing a request.
- The exception filter read the request id from a property the types said always existed, which is a useless check. I reworked it to read through an `unknown` access so the optional handling is real.
- The repository built its query conditions by mutating an array behind a guard with an unreachable branch. I rewrote it as an immutable spread with a SQL-template visibility predicate, which removed both the dead branch and the mutation.
- The metrics interceptor leaked Express's `any`-typed `route` property. I replaced the unsafe access with a small typed narrowing helper.

## How I verified the result

SQL was the part I trusted least, so I checked it hardest. I loaded a 50,030-row dataset, because Postgres correctly prefers a sequential scan on the 30-row seed and would have hidden the index behavior, and I read the `EXPLAIN (ANALYZE, BUFFERS)` plans myself. They confirm an Index Only Scan on `resource_shares_user_id_idx` for the shared lookup, an Index Scan with no sort for the owner-scoped query, and keyset ordering with a bitmap share lookup for the full visibility query. The plans are in [PR_DESCRIPTION.md](PR_DESCRIPTION.md).

For the tests, I checked both directions of the access rule, not just the happy path: a member sees a resource shared to them and does not see one they neither own nor are shared, a member cannot list another user's resources, and an unauthenticated request gets a 401 rather than an empty list. I held coverage at 95 percent per file and marked the two genuinely unreachable database-guarded branches with a justified ignore rather than fake a test for them. I load tested the HTTP path with autocannon and recorded the numbers. Every gate is green: types, lint, format, the full suite, and a production build that boots.

## What I would do next

The header auth is a development stub; in production I would run the JWT mode against a real issuer. The cache has no write-path invalidation yet because the API is read-only, though the keys are shaped to support it. And the row-level rule lives in the application today; the natural next step is to back it with a database policy as defense in depth, which I sketched in [docs/rls.md](docs/rls.md).
