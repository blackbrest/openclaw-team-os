# OpenClaw Team OS

OpenClaw Team OS is a desktop-first AI team operating system scaffold built on top of OpenClaw as the runtime layer.

## UI guidelines

The current UI source of truth lives in [docs/UI_GUIDELINES.md](/Users/wangliang/Documents/OpenClaw_Team_OS/docs/UI_GUIDELINES.md).

When making future interface adjustments, prefer following the documented layout, typography, spacing, and interaction rules there before introducing new one-off visual decisions.

## Workspace layout

```text
apps/
  api/         Fastify API + mock runtime orchestration
  web/         Vite + React client workbench
  desktop/     Electron shell for the web client
packages/
  config/      Shared app constants
  domain/      Core types and status models
  sdk/         Client-side API helpers
  runtime-adapter/
               Runtime adapter contracts and mock adapter
  ui/          Shared React UI primitives
```

## Quick start

1. Install dependencies:

   ```bash
   pnpm install
   ```

   On macOS, you can also double-click [OpenClaw Team OS.command](/Users/wangliang/Documents/OpenClaw_Team_OS/OpenClaw%20Team%20OS.command) after dependencies are installed. It will build the workspace, start the local API, and open the desktop client for you.

2. Copy the runtime env template if you want to connect a real OpenClaw Gateway:

   ```bash
   cp .env.example .env.local
   ```

   Default mode is `mock`. To use a real Gateway, set:

   ```bash
   OPENCLAW_RUNTIME_MODE=openclaw-llm-task
   OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
   OPENCLAW_GATEWAY_TOKEN=your_gateway_token
   ```

   The same Gateway settings are also used by the project IM employee chat. Once configured, employee direct messages and lead replies can switch from local fallback logic to real LLM responses.

   If you also want the short-drama workspace to submit scene packs to a real video generator, you can choose either provider below.

   ShortAPI + Seedance 2.0:

   ```bash
   VIDEO_PROVIDER=shortapi
   SHORTAPI_KEY=your_shortapi_key
   SHORTAPI_BASE_URL=https://api.shortapi.ai
   SHORTAPI_VIDEO_MODEL=bytedance/seedance-2.0/text-to-video
   SHORTAPI_VIDEO_MODE=std
   ```

   ModelArk:

   ```bash
   VIDEO_PROVIDER=modelark
   ARK_API_KEY=your_modelark_api_key
   MODELARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
   MODELARK_VIDEO_MODEL=seedance-1-5-pro-251215
   MODELARK_VIDEO_RESOLUTION=720p
   ```

3. If you want persistent storage, start Postgres first:

   ```bash
   pnpm db:up
   ```

   If port `5432` is already occupied on your machine, start Docker Postgres on a different host port:

   ```bash
   POSTGRES_PORT=55432 pnpm db:up
   ```

   Then update `DATABASE_URL` accordingly, for example `postgresql://openclaw:openclaw@127.0.0.1:55432/openclaw_team_os`. The default `DATABASE_URL` in `.env.example` points at the Docker Postgres service from [compose.yaml](/Users/wangliang/Documents/OpenClaw_Team_OS/compose.yaml).

   You can also run migrations manually:

   ```bash
   pnpm db:migrate
   ```

   The API also applies pending migrations automatically on startup, so local development works even if you skip this step.

4. Start the API and web client:

   ```bash
   pnpm dev
   ```

5. In another terminal, start the desktop shell against the web dev server:

   ```bash
   pnpm dev:desktop
   ```

## No-Docker deployment

If you want to deploy without Docker, the current recommended split is:

- `apps/web` -> Vercel
- `apps/api` -> persistent Node runtime
- `Postgres` -> managed database
- `OpenClaw Gateway` -> persistent runtime

Deployment notes:

- [Vercel web deployment guide](/Users/wangliang/Documents/OpenClaw_Team_OS/docs/DEPLOY_VERCEL_WEB_NO_DOCKER.md)
- [Render API deployment guide](/Users/wangliang/Documents/OpenClaw_Team_OS/docs/DEPLOY_RENDER_API_NO_DOCKER.md)
- [Deployment boundaries](/Users/wangliang/Documents/OpenClaw_Team_OS/docs/DEPLOY_BOUNDARIES.md)

The production web app expects `VITE_API_BASE_URL` and can use:

- [apps/web/.env.production.example](/Users/wangliang/Documents/OpenClaw_Team_OS/apps/web/.env.production.example)

There is also a starter Render Blueprint for the API and Postgres:

- [render.yaml](/Users/wangliang/Documents/OpenClaw_Team_OS/render.yaml)

## One-click local launch

If you want a simpler "just open the client" flow from this repo, use:

```bash
pnpm start:local
```

This launcher will:

- install dependencies if `node_modules` is still missing
- build the current workspace
- start the local API on `127.0.0.1:4000`
- open the Electron desktop client against the built local renderer

On macOS, the same flow is available by double-clicking [OpenClaw Team OS.command](/Users/wangliang/Documents/OpenClaw_Team_OS/OpenClaw%20Team%20OS.command).

## macOS launcher app

If you want a more product-like launch entry on macOS, build the dedicated launcher app:

```bash
pnpm launcher:mac
```

This generates [OpenClaw Team OS Launcher.app](/Users/wangliang/Documents/OpenClaw_Team_OS/OpenClaw%20Team%20OS%20Launcher.app) in the project root. The launcher app opens Terminal, runs the same local boot flow, and uses the desktop app icon.

## E2E smoke

Run the repeatable browser acceptance flow for the MVP client:

```bash
pnpm exec playwright install chromium
pnpm e2e:smoke
```

The smoke script will:

- build the workspace if the local API or web preview is not already running
- start `apps/api` and a Vite preview server when needed
- create a new organization
- hire the first AI team
- submit the first task
- approve it
- verify that a deliverable appears

Artifacts are written to `output/playwright/e2e-smoke/`.

## Desktop smoke

Run the repeatable Electron acceptance flow for the packaged desktop shell:

```bash
pnpm exec playwright install chromium
pnpm e2e:desktop-smoke
```

The desktop smoke script will:

- build the workspace before launching Electron
- start `apps/api` when needed
- launch the Electron shell against the built `apps/web/dist` bundle
- create a new organization
- hire the first AI team
- submit the first task
- approve it
- verify that a deliverable appears

Artifacts are written to `output/playwright/e2e-desktop-smoke/`.

## Desktop packaging

Build a beta desktop bundle for the current OS:

```bash
pnpm --filter @openclaw-team-os/desktop generate:icon
pnpm package:desktop
```

This packaging flow will:

- use the desktop brand icon assets from `apps/desktop/build/`
- build the full workspace
- copy the built web client into the Electron app bundle
- package the current platform target with `electron-builder`
- generate `release-manifest.json` with artifact paths, sizes, and SHA256 checksums

Desktop release artifacts are written to `output/releases/desktop/`.

If `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`, and a valid signing identity are configured, the `afterSign` hook will also submit the macOS app for notarization. Otherwise notarization is skipped automatically.

## Packaged desktop smoke

Validate the generated desktop archive itself, not just the source-mode Electron shell:

```bash
pnpm e2e:packaged-desktop-smoke
```

This smoke flow will:

- build and package the desktop app for the current OS
- unpack the generated desktop archive
- launch the unpacked packaged app
- run the same first-run organization, team, task, approval, and deliverable flow

Artifacts are written to `output/playwright/e2e-packaged-desktop-smoke/`.

## Short-drama video generation

The short-drama result workspace now supports two layers:

- a `Seedance 2.0` style handoff pack for script, shots, and prompts
- an automatic submit button that sends scene batches to either `ShortAPI Seedance 2.0` or a `ModelArk` video model, depending on your env

The automatic flow is intentionally scene-based: each short-drama shot is submitted as an individual video generation task, then the desktop client polls their status and shows returned clip URLs in the result panel.

If neither `SHORTAPI_KEY` nor `ARK_API_KEY` is configured, the client still shows the structured handoff pack and will explain that remote video generation is not configured yet.

For a repeatable local verification of the automatic submit / refresh path without touching a real remote account, run:

```bash
pnpm e2e:short-drama-video
```

This starts a protocol-compatible local ModelArk mock server, launches the API with video generation enabled, and verifies:

- short-drama writer recruitment
- bundled short-drama team recruitment
- task approval for both units
- scene-batch submission to the video generator
- clip status refresh and returned clip links in the result workspace

Even if your local `.env.local` is configured for `ShortAPI`, this smoke script forces the API onto the mock `ModelArk` provider so it stays fast and repeatable.

## Mock auth and org isolation

The API now scopes team data, approvals, budgets, audit logs, and SSE events to the current organization context.

- If you send no auth context, the app falls back to the default demo user and org.
- For API testing, you can override identity with headers such as `x-user-name`, `x-org-id`, `x-org-name`, and `x-org-role`.
- You can also authenticate with a session token via `Authorization: Bearer <token>` or `x-session-token`.
- For the web client, you can set Vite env vars such as `VITE_SESSION_TOKEN`, `VITE_USER_NAME`, `VITE_ORG_ID`, `VITE_ORG_NAME`, and `VITE_ORG_ROLE`.

The seeded default admin session token is `demo-org-admin-token`.

Example:

```bash
curl -s http://127.0.0.1:4000/api/v1/me \
  -H 'x-user-name: Alice' \
  -H 'x-org-id: org_other_lab' \
  -H 'x-org-name: Other Lab'
```

## Default ports

- Web: `5173`
- API: `4000`

## Current state

This repository currently contains:

- Product requirements
- Technical architecture
- System modules and API draft
- A runnable monorepo scaffold with runtime, persistence, session auth, invitations, and a desktop-first workbench UI

The next implementation step is replacing the mocked runtime orchestration with a real OpenClaw adapter.

## Runtime modes

The API now supports two runtime modes:

- `mock`
  Good for UI and product iteration without a configured Gateway.
- `openclaw-llm-task`
  Calls a real OpenClaw Gateway via `/tools/invoke` using the `llm-task` tool.

When `OPENCLAW_RUNTIME_MODE=openclaw-llm-task` is requested but the Gateway URL or token is missing, the API falls back to mock mode and exposes that fallback in the runtime status payload shown by the web UI.

## Persistence modes

The API now supports two persistence modes:

- `memory`
  Used when `DATABASE_URL` is not set.
- `postgres`
  Used when `DATABASE_URL` is set and reachable.

The following records are persisted in Postgres:

- team instances
- team budgets
- tasks
- task steps
- approvals
- deliverables
- audit logs

## OpenClaw prerequisites

The real adapter assumes:

- An OpenClaw Gateway is running and reachable from the API process
- The Gateway accepts `Authorization: Bearer <token>` for `/tools/invoke`
- The `llm-task` tool is enabled for the configured session/profile

Useful API endpoints:

- `GET /api/v1/runtime-status`
- `GET /api/v1/team-instances/:teamInstanceId/dashboard`
- `GET /api/v1/stream`
