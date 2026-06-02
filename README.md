# Aqsha

Aqsha is a Convex-backed personal research chatbot with a Next.js product app and an Astro marketing site.

## Monorepo Structure

```txt
apps/
  app/      Next.js authenticated product app
  www/      Astro marketing website
packages/
  convex/   Convex functions, schema, components, and tests
  ui/       Shared React UI primitives and styles
```

## Tech Stack

- **Runtime and package manager**: Bun
- **Product app**: Next.js 16, React 19, Tailwind CSS 4
- **Marketing site**: Astro, React islands, Tailwind CSS 4
- **Backend**: Convex, Clerk Auth, `@convex-dev/agent`, rate limiting, workflow, internal provenance storage
- **AI**: AI SDK with OpenAI-compatible chat and embedding providers through Convex functions
- **Shared UI**: Radix primitives and shadcn-style components in `packages/ui`

## Getting Started

Install dependencies from the repository root:

```bash
bun install
```

Run the active product app, Convex backend, and marketing site together:

```bash
bun dev
```

Run only the product app and Convex backend:

```bash
bun run dev:pivot
```

Or run a single workspace:

```bash
bun run dev:app
bun run dev:convex
bun run dev:www
```

## Scripts

```bash
bun run build       # Build app and www
bun run lint        # Lint app and Convex package
bun run typecheck   # Type-check app, www, Convex, and UI package
```

Convex workspace commands:

```bash
bun run --filter '@aqsha/convex' codegen
bun run --filter '@aqsha/convex' deploy
bun run --filter '@aqsha/convex' logs
bun run --filter '@aqsha/convex' test
```

## Development Notes

- `apps/web` imports generated Convex bindings from `@aqsha/convex/api` and `@aqsha/convex/server`.
- `apps/web` and `apps/www` both consume shared UI from `@aqsha/ui`.
- Convex environment is managed by `convex dev` and the Convex dashboard.
- Convex AI chat env can be routed independently with `AQSHA_CHAT_API_KEY`, `AQSHA_CHAT_BASE_URL`, and `AQSHA_CHAT_PROVIDER_NAME`.
- Convex RAG embedding env can be routed independently with `AQSHA_EMBEDDING_API_KEY`, `AQSHA_EMBEDDING_BASE_URL`, `AQSHA_EMBEDDING_PROVIDER_NAME`, `AQSHA_RAG_EMBEDDING_MODEL`, and `AQSHA_RAG_EMBEDDING_DIMENSION`.
- Legacy `OPENAI_API_KEY` and `OPENAI_BASE_URL` still work as fallback values, but provider-specific routing should use the `AQSHA_*` namespaced env vars.
- Only `packages/convex` has a test runner configured.
