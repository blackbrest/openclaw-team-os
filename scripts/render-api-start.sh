#!/usr/bin/env bash

set -euo pipefail

if [[ -z "${OPENCLAW_GATEWAY_URL:-}" && -n "${OPENCLAW_GATEWAY_HOSTPORT:-}" ]]; then
  export OPENCLAW_GATEWAY_URL="http://${OPENCLAW_GATEWAY_HOSTPORT}"
fi

exec pnpm --filter @openclaw-team-os/api start
