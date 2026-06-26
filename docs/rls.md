# Row-level security: app-layer policy and its database equivalent

The visibility rule in this service is row-level security. It is enforced at the application layer today, in one place, and it maps cleanly to a Postgres `CREATE POLICY` row-level-security policy. This document shows both and explains the trade-off.

## The rule

A member sees a resource when they own it or it is shared with them. An admin sees everything. The application expresses this in [src/resources/access-policy.ts](../src/resources/access-policy.ts) and applies it in the shared repository query as:

```sql
WHERE owner_id = :viewer
   OR EXISTS (SELECT 1 FROM resource_shares rs
              WHERE rs.resource_id = resources.id AND rs.user_id = :viewer)
```

## The Postgres RLS equivalent

The same rule as a database policy, enforced by the engine regardless of which query reaches it:

```sql
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY resources_visibility ON resources
  FOR SELECT
  USING (
    owner_id = current_setting('app.user_id')::bigint
    OR EXISTS (
      SELECT 1 FROM resource_shares rs
      WHERE rs.resource_id = resources.id
        AND rs.user_id = current_setting('app.user_id')::bigint
    )
  );
```

The application sets `app.user_id` per connection or transaction from the authenticated identity. When the JWT auth mode is active, that value is the verified token's `sub` claim, resolved in [src/auth/jwt-verifier.ts](../src/auth/jwt-verifier.ts), so the policy keys off the same identity the application already trusts. Admins either bypass via a role with `BYPASSRLS` or a policy branch on a role claim.

## Why app-layer here, and when to move to the database

| Dimension | App-layer (chosen) | Database RLS |
|-----------|--------------------|--------------|
| Defense in depth | One enforcement point; a raw query could bypass it | Enforced by the engine for every query and client |
| Testability | Plain unit tests on the policy function | Needs a database session per case |
| Portability | Works across any datastore | Postgres-specific |
| Performance control | Full control over the query plan and indexes | Policy predicates can surprise the planner |
| Migration cost | None | Session-variable or JWT plumbing, role design |

For this exercise the app-layer rule is the right call: it keeps the SQL legible, the policy unit-tested, and the index strategy explicit, while staying one short step from a database policy. The recommended production end state pairs both: RLS as the backstop, the application policy for ergonomics and query shaping.
