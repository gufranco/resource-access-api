# OWASP API Security Top 10 (2023) mapping

How this service addresses each risk. The central one for this codebase is API1, which the access-control task exists to fix.

| Risk | Status | Where |
|------|--------|-------|
| API1 Broken Object Level Authorization | Addressed | The shared listing path scopes every query to the caller (own or shared), and `GET /users/:userId/resources` is restricted to self or admin. See [src/resources/access-policy.ts](../src/resources/access-policy.ts) and [src/resources/resources.repository.ts](../src/resources/resources.repository.ts). |
| API2 Broken Authentication | Addressed | Identity is resolved in one guard. The JWT mode verifies signature, issuer, audience, and expiry through a JWKS or shared secret. See [src/auth/jwt-verifier.ts](../src/auth/jwt-verifier.ts). The `x-user-id` header is a documented dev stub. |
| API3 Broken Object Property Level Authorization | Addressed | Responses are projected through an explicit Zod schema, so no internal column leaks. See [src/resources/dto/resource.response.ts](../src/resources/dto/resource.response.ts). |
| API4 Unrestricted Resource Consumption | Addressed | Rate limiting via the throttler, a hard maximum page size, and keyset pagination that never scans skipped rows. See [src/app.module.ts](../src/app.module.ts) and [src/resources/pagination.ts](../src/resources/pagination.ts). |
| API5 Broken Function Level Authorization | Addressed | A global guard denies by default; only routes marked `@Public()` skip it. Admin bypass is decided once in the policy. |
| API6 Unrestricted Access to Sensitive Business Flows | Partial | Read-only API; no sensitive write flows exist yet. Rate limiting bounds scraping. |
| API7 Server Side Request Forgery | Not applicable | The service makes no outbound requests from user input. |
| API8 Security Misconfiguration | Addressed | Helmet headers, configurable CORS, environment validation at startup, and RFC 7807 errors that never leak stack traces. See [src/common/filters/all-exceptions.filter.ts](../src/common/filters/all-exceptions.filter.ts). |
| API9 Improper Inventory Management | Addressed | A single versioned OpenAPI document at `/docs`; health and metrics endpoints are explicit. |
| API10 Unsafe Consumption of APIs | Not applicable | No third-party API responses are consumed. |

## Pipeline-level controls

The CI workflow in [.github/workflows/ci.yml](../.github/workflows/ci.yml) adds dependency audit, secret scanning (gitleaks), static analysis (CodeQL), and container image scanning (Trivy) on every push and pull request.
