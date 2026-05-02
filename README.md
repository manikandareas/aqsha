# Aqsha

Aqsha is an open-source monorepo for AI-assisted writing and journaling. It combines a modern web app, a type-safe Bun API, shared UI primitives, and a PostgreSQL-backed domain model for user-owned journals, chat threads, and authentication.

## What is inside?

- **AI chat**: persisted chat threads and streamed assistant responses through an internal agents service.
- **Journaling system**: journal CRUD, content saves, outlines, archive/restore flows, and version history.
- **Authentication**: Better Auth integration with API-side session handling.
- **Type-safe API client**: Elysia + Eden Treaty wiring between the frontend and backend.
- **Shared packages**: reusable database schema, shared helpers, and UI components for apps in the workspace.
- **Marketing site**: Astro-powered public website alongside the authenticated app.

## Monorepo structure

```txt
apps/
  api/      Bun + Elysia API service
  web/      Next.js authenticated product app
  www/      Astro marketing website
packages/
  db/       Drizzle schema, database types, and model helpers
  shared/   Shared TypeScript helpers
  ui/       Shared React UI primitives and styles
```

## Tech stack

- **Runtime and package manager**: Bun
- **Frontend app**: Next.js 16, React 19, Tailwind CSS 4, TanStack Query
- **Marketing site**: Astro, React, Tailwind CSS
- **API**: Elysia, Eden Treaty, OpenAPI, Zod
- **Auth**: Better Auth
- **Database**: PostgreSQL, Drizzle ORM, Drizzle Kit
- **AI**: Vercel AI SDK-compatible streaming with an internal agents service
- **UI/editor**: Radix UI, shadcn-style primitives, Plate editor components

## Requirements

- Bun `1.3.10` or newer
- PostgreSQL database
- An agents service reachable by the API for chat streaming

## Getting started

Install dependencies from the repository root:

```bash
bun install
```

Create the API environment file:

```bash
cp apps/api/.env.example apps/api/.env
```

If there is no example file in your checkout, create `apps/api/.env` with:

```bash
API_PORT=3001
WEB_ORIGIN=http://localhost:3000
BETTER_AUTH_URL=http://localhost:3001
BETTER_AUTH_SECRET=replace-with-at-least-32-characters
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aqsha
AGENTS_BASE_URL=http://127.0.0.1:8001
ASTRA_INTERNAL_TOKEN=replace-with-an-internal-token
```

Optionally create `apps/web/.env.local` to point the web app at a different API URL:

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Run database migrations:

```bash
bun run --filter '@aqsha/api' db:migrate
```

Start all apps:

```bash
bun dev
```

Or run a single workspace:

```bash
bun run dev:web
bun run dev:www
bun run dev:api
```

Default local services:

- Web app: `http://localhost:3000`
- API: `http://localhost:3001`
- API OpenAPI docs: `http://localhost:3001/openapi`
- Marketing site: Astro's local dev URL

## Scripts

From the repository root:

```bash
bun run build       # Build web, www, and api
bun run lint        # Lint app and package workspaces
bun run typecheck   # Type-check app and package workspaces
```

API database scripts:

```bash
bun run --filter '@aqsha/api' db:generate
bun run --filter '@aqsha/api' db:migrate
bun run --filter '@aqsha/api' db:studio
bun run --filter '@aqsha/api' db:check
```

## Development notes

- The API reads environment variables from `apps/api/.env` through `@t3-oss/env-core`.
- The web app reads `NEXT_PUBLIC_API_URL` and defaults to `http://localhost:3001`.
- API routes are composed as Elysia modules under `apps/api/src/modules`.
- Shared database schema and types live in `packages/db`.
- Shared UI primitives live in `packages/ui` and are consumed by the apps.

## Contributing

Contributions are welcome. For local changes, prefer small focused pull requests that include:

1. A clear description of the change.
2. Any relevant screenshots or API examples.
3. Passing `bun run lint` and `bun run typecheck`.
4. Database migrations when schema changes are introduced.

## License

No license has been specified yet. Add one before publishing or distributing this project as open source.
