# OpenClaw Team OS Web Deployment (No Docker)

This document describes the fastest low-ops deployment path for the current codebase without Docker.

## Recommended topology

- `apps/web`: deploy to Vercel
- `apps/api`: deploy to a persistent Node runtime
- `Postgres`: managed database
- `OpenClaw Gateway`: persistent runtime, private to the API when possible
- `Cloudflare`: DNS, TLS, CDN, optional proxying

## Important boundary

Vercel is a good fit for the **web client** in this repository.

Vercel is **not** the best place to host the current `OpenClaw Gateway` runtime or the full long-lived collaboration backend as-is. The current API talks to:

- a database
- a persistent OpenClaw Gateway
- long-running model calls
- video generation providers

Treat Vercel as the frontend hosting layer, not as the only runtime for the whole product.

## What can go to Vercel right now

- `apps/web`
- static assets
- client routing
- public product access

## What must stay on persistent compute

- `apps/api`
- `OpenClaw Gateway`
- `Postgres`
- polling / generation orchestration
- project chat model calls

## Vercel project setup

Create a Vercel project from this repository and configure:

- **Framework Preset**: `Vite`
- **Root Directory**: `apps/web`
- **Install Command**: `pnpm install`
- **Build Command**: `pnpm --filter @openclaw-team-os/web build`
- **Output Directory**: `dist`

## Required Vercel environment variables

At minimum:

```bash
VITE_API_BASE_URL=https://api.your-domain.com
```

Optional identity defaults for demos:

```bash
VITE_SESSION_TOKEN=
VITE_USER_NAME=Wang Liang
VITE_ORG_ID=org_openclaw_studio
VITE_ORG_NAME=OpenClaw Studio
VITE_ORG_ROLE=org_admin
```

## Build assumptions

The web app already reads:

- `VITE_API_BASE_URL`
- optional `VITE_*` identity overrides

The relevant code path is in:

- `/Users/wangliang/Documents/OpenClaw_Team_OS/apps/web/src/App.tsx`

## Domain shape

Recommended public domain split:

- `app.your-domain.com` -> Vercel web
- `api.your-domain.com` -> persistent API

Optional internal/private:

- `gateway.internal` or private host -> OpenClaw Gateway

## Suggested rollout order

1. Deploy the frontend to Vercel.
2. Confirm the site loads with a production `VITE_API_BASE_URL`.
3. Deploy `apps/api` to persistent compute.
4. Connect `Postgres`.
5. Connect `OpenClaw Gateway`.
6. Verify `/api/v1/runtime-status`.
7. Verify project chat and execution draft flow.

## Production acceptance checklist

- Web loads over HTTPS
- `VITE_API_BASE_URL` points to production API
- API health endpoint responds
- database migrations are applied
- session auth works
- employee recruitment works
- project creation works
- project chat works
- `executionDraft` returns on explicit execution messages
- real model path works, not only fallback
- video provider credentials are configured if short-drama generation is enabled

## Reality check: when does “real AI employee chat” become active?

Deploying the frontend alone does **not** make the AI employees real.

Real AI employee chat requires all of the following:

- deployed API
- reachable OpenClaw Gateway
- valid Gateway token
- valid model/provider account
- usable provider quota

If any of those fail, the app will fall back to local role-based replies.
