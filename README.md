# Aqsha Monorepo

Minimal Bun-managed monorepo scaffold with:

- `apps/web`: Next.js 16 App Router app
- `apps/api`: Elysia API running on Bun
- `packages/shared`: shared types and helpers

## Requirements

- Bun `1.3.10` or newer

## Install

```bash
bun install
```

## Run

Start both apps from the repo root:

```bash
bun dev
```

Run a single workspace:

```bash
bun run dev:web
bun run dev:api
```

## Build And Checks

```bash
bun run build
bun run lint
bun run typecheck
```

## Environment

The web app reads `NEXT_PUBLIC_API_URL` and defaults to `http://localhost:3001`.

Create `apps/web/.env.local` if you want to point the frontend at a different API:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```
