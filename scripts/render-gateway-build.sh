#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${ROOT_DIR}/.render-tools"
OPENCLAW_NPM_VERSION="${OPENCLAW_NPM_VERSION:-2026.3.28}"

rm -rf "${TOOLS_DIR}"
mkdir -p "${TOOLS_DIR}"

npm install --prefix "${TOOLS_DIR}" "openclaw@${OPENCLAW_NPM_VERSION}"
