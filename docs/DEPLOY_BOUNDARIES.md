# Deployment Boundaries

This file defines what belongs on static hosting vs persistent compute in the current OpenClaw Team OS architecture.

## Static / edge-friendly

These parts are safe to host on Vercel or Cloudflare Pages:

- `apps/web`
- `apps/web/public`
- built static assets in `apps/web/dist`

## Persistent runtime required

These parts should stay on a long-running runtime:

- `apps/api`
- `OpenClaw Gateway`
- `Postgres`
- any background polling or orchestration

## Why the backend is not “frontend-only deployable”

The current backend is not just a thin BFF. It coordinates:

- organization and session state
- project chat
- execution drafts
- assignments and reports
- approval flow
- video generation status checks
- real model access via OpenClaw Gateway

That makes it a persistent application backend, not a pure serverless convenience layer.

## Current best split

Use this split unless the backend is intentionally rewritten for serverless:

- `Vercel / Cloudflare Pages` -> web app
- `Render / Railway / Fly / self-hosted Linux` -> API
- `Managed Postgres` -> data
- `Persistent gateway host` -> OpenClaw Gateway
