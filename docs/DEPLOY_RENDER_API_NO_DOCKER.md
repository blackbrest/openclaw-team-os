# OpenClaw Team OS API Deployment on Render (No Docker)

This document covers the current recommended way to deploy the backend without Docker.

## Recommended split

- `apps/web` -> Vercel
- `apps/api` -> Render Web Service
- `Postgres` -> Render Postgres
- `OpenClaw Gateway` -> separate persistent runtime

## Current recommendation

The most reliable production setup for this repository is now:

- keep the API on Render in `mock` runtime mode
- run `OpenClaw Gateway` as a separate **Render Private Service**
- let the API call the gateway over Render's private network
- use `OPENAI_API_KEY` on the gateway host instead of tunneling a local laptop gateway

This avoids the unstable public tunnel problem entirely.

## Important limitation

The API is ready to deploy on Render today.

The `OpenClaw Gateway` still depends on:

- a long-running OpenClaw runtime
- model/provider account availability
- a real provider credential such as `OPENAI_API_KEY`

That means:

- you can ship the web + API + database now
- the product will run
- local fallback employee chat will still work
- real OpenClaw model chat becomes active only after the gateway side is reachable, healthy, and has a working model key

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
./scripts/render-api-start.sh
```

### 3. OpenClaw Gateway private service

Create a Render **Private Service** from this repository with:

- **Environment**: `Node`
- **Root Directory**: repository root
- **Build Command**:

```bash
./scripts/render-gateway-build.sh
```

- **Start Command**:

```bash
./scripts/render-gateway-start.sh
```

- **Health Check Path**:

```bash
/health
```

- **Persistent Disk**:

```text
mountPath=/var/data
size=1GB+
```

## Required API environment variables

Minimum:

```bash
DATABASE_URL=postgresql://...
OPENCLAW_RUNTIME_MODE=mock
```

The API can stay in `mock` runtime mode while still using real employee chat through the private gateway.

Recommended API env for private-gateway chat:

```bash
OPENCLAW_RUNTIME_MODE=mock
OPENCLAW_GATEWAY_HOSTPORT=<from Render private service reference>
OPENCLAW_GATEWAY_URL=
OPENCLAW_GATEWAY_TOKEN=<from gateway service env reference>
OPENCLAW_GATEWAY_SESSION_KEY=main
OPENCLAW_LLM_TASK_PROVIDER=openai
OPENCLAW_LLM_TASK_MODEL=gpt-5.4
OPENCLAW_LLM_TASK_THINKING=low
OPENCLAW_LLM_TASK_MAX_TOKENS=1200
```

Required gateway env:

```bash
PORT=10000
OPENCLAW_GATEWAY_PORT=10000
OPENCLAW_STATE_DIR=/var/data/.openclaw
OPENCLAW_WORKSPACE_DIR=/var/data/workspace
OPENCLAW_GATEWAY_TOKEN=<shared secret>
OPENAI_API_KEY=<real OpenAI API key>
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
2. Deploy the OpenClaw Gateway as a Render private service.
3. Deploy the Render API in `mock` mode with the gateway host/token wired over private networking.
4. Point Vercel frontend to the Render API.
5. Verify end-to-end onboarding and project collaboration.
6. Verify `POST /api/v1/project-chat/reply` returns `mode: "model"` before changing anything else.

## Current production reality

At the time of writing, the API code path supports:

- OpenClaw-first project chat
- fallback role-based chat when model runtime is unavailable

This is intentional and useful for staged rollout.

## Why private service beats a tunnel

Using a Render private service for the gateway is better than exposing a gateway running on a laptop via a free tunnel because:

- the gateway stays online after your laptop sleeps or disconnects
- the API talks to the gateway over Render's internal network
- the gateway token can be referenced directly from the gateway service in `render.yaml`
- you no longer depend on temporary public tunnel URLs that can time out or rotate
