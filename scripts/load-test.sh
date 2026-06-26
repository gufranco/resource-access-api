#!/usr/bin/env bash
set -euo pipefail

# HTTP load test for GET /resources using autocannon.
# The app must already be running and reachable at BASE_URL.
#
#   pnpm run start:dev   # in another terminal, with a raised RATE_LIMIT_MAX
#   pnpm run loadtest
#
# Override with env vars: BASE_URL, USER_ID, CONNECTIONS, DURATION.

BASE_URL="${BASE_URL:-http://localhost:3000}"
USER_ID="${USER_ID:-1}"
CONNECTIONS="${CONNECTIONS:-50}"
DURATION="${DURATION:-10}"

exec pnpm exec autocannon \
  -c "${CONNECTIONS}" \
  -d "${DURATION}" \
  -H "x-user-id=${USER_ID}" \
  "${BASE_URL}/resources?limit=20"
