# OpenClaw Team OS API Deployment on Render (No Docker)

This document covers the current recommended way to deploy the backend without Docker.

## Recommended split

- `apps/web` -> Vercel
- `apps/api` -> Render Web Service
- `Postgres` -> Render Postgres
- `OpenClaw Gateway` -> separate persistent runtime

## Important limitation

The API is ready to deploy on Render today.

The `OpenClaw Gateway` is **not yet fully productized in this repository as a one-click Render service** because it depends on:

- a long-running OpenClaw runtime
- provider auth state
- model/provider account availability
- stable Gateway tool execution

That means:

- you can ship the web + API + database now
- the product will run
- local fallback employee chat will still work
- real OpenClaw model chat becomes active only after the gateway side is reachable and healthy

## Render services to create

### 1. Postgres

Create a Render Postgres database and copy its internal or external connection string into:

```bash
DATABASE_URL=postgresql://...
```

### 2. API web service

Create a Render **Web Service** from this repository with:

- **Environment**: `Node`
- **Root Directory**: repository root
- **Build Command**:

```bash
pnpm install --frozen-lockfile && pnpm build:api-deploy
```

- **Start Command**:

```bash
pnpm --filter @openclaw-team-os/api start
```

## Required API environment variables

Minimum:

```bash
DATABASE_URL=postgresql://...
OPENCLAW_RUNTIME_MODE=mock
```

For real project chat / runtime via OpenClaw:

```bash
OPENCLAW_RUNTIME_MODE=openclaw-llm-task
OPENCLAW_GATEWAY_URL=https://your-gateway-host
OPENCLAW_GATEWAY_TOKEN=your_gateway_token
OPENCLAW_GATEWAY_SESSION_KEY=main
OPENCLAW_LLM_TASK_PROVIDER=openai-codex
OPENCLAW_LLM_TASK_MODEL=gpt-5.4
OPENCLAW_LLM_TASK_THINKING=low
OPENCLAW_LLM_TASK_MAX_TOKENS=1200
```

For short-drama video generation, choose one:

```bash
SHORTAPI_KEY=...
SHORTAPI_BASE_URL=https://api.shortapi.ai
SHORTAPI_VIDEO_MODEL=vidu/vidu-q3/text-to-video
SHORTAPI_VIDEO_MODE=pro
```

or

```bash
ARK_API_KEY=...
MODELARK_BASE_URL=https://ark.ap-southeast.bytepluses.com/api/v3
MODELARK_VIDEO_MODEL=seedance-1-5-pro-251215
MODELARK_VIDEO_RESOLUTION=720p
```

## Health checks

After deploy, confirm:

- `GET /health`
- `GET /api/v1/runtime-status`
- `POST /api/v1/project-chat/reply`

## What “ready for use” means

### Ready immediately after API + DB deploy

- onboarding
- employee recruitment
- project creation
- project collaboration UI
- local fallback employee chat
- project execution drafts

### Requires working gateway before it becomes “real model chat”

- OpenClaw-backed employee IM
- real model reasoning in project chat
- model-backed assignment generation

## Suggested rollout

1. Deploy Render Postgres.
2. Deploy Render API in `mock` mode first.
3. Point Vercel frontend to the Render API.
4. Verify end-to-end onboarding and project collaboration.
5. Add gateway variables only after the gateway itself is stable.

## Current production reality

At the time of writing, the API code path supports:

- OpenClaw-first project chat
- fallback role-based chat when model runtime is unavailable

This is intentional and useful for staged rollout.
