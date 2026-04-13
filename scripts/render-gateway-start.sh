#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCLAW_BIN="${ROOT_DIR}/.render-tools/node_modules/.bin/openclaw"

if [[ ! -x "${OPENCLAW_BIN}" ]]; then
  echo "OpenClaw CLI not found. Run ./scripts/render-gateway-build.sh first." >&2
  exit 1
fi

export OPENCLAW_GATEWAY_PORT="${OPENCLAW_GATEWAY_PORT:-${PORT:-10000}}"
export OPENCLAW_STATE_DIR="${OPENCLAW_STATE_DIR:-/var/data/.openclaw}"
export OPENCLAW_WORKSPACE_DIR="${OPENCLAW_WORKSPACE_DIR:-/var/data/workspace}"
export OPENCLAW_CONFIG_PATH="${OPENCLAW_CONFIG_PATH:-${OPENCLAW_STATE_DIR}/openclaw.json}"

mkdir -p "${OPENCLAW_STATE_DIR}" "${OPENCLAW_WORKSPACE_DIR}"

if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "OPENAI_API_KEY is not set. Gateway will start, but llm-task calls will fail until you add a real key." >&2
fi

"${OPENCLAW_BIN}" config set gateway.mode '"local"' --strict-json
"${OPENCLAW_BIN}" config set gateway.bind '"lan"' --strict-json
"${OPENCLAW_BIN}" config set gateway.auth.mode '"token"' --strict-json
"${OPENCLAW_BIN}" config set gateway.port "${OPENCLAW_GATEWAY_PORT}" --strict-json
"${OPENCLAW_BIN}" config set gateway.controlUi.enabled false --strict-json

exec "${OPENCLAW_BIN}" gateway run --bind lan --auth token --port "${OPENCLAW_GATEWAY_PORT}"
