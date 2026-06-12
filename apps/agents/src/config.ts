import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Service configuration (plan §4.2 config.ts). Everything env-driven so model
// tiers and budgets can change without a code edit (decision D6).

const DEFAULT_LITE_MODEL = "claude-haiku-4-5";
const DEFAULT_PRO_MODEL = "claude-sonnet-4-6";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  AGENTS_PORT: z.coerce.number().int().positive().default(8787),
  // Shared secret for inbound requests from Convex (plan §4.4). Empty in dev →
  // auth middleware refuses everything except /healthz unless explicitly
  // disabled via AGENTS_ALLOW_UNAUTHENTICATED=1 for local spikes.
  AGENTS_SERVICE_TOKEN: z.string().optional(),
  AGENTS_ALLOW_UNAUTHENTICATED: z.coerce.boolean().default(false),
  // Storage backend: in-memory for spike/dev, convex once the first-party
  // tables (plan §4.5) land in packages/convex.
  AGENTS_STORE: z.enum(["memory", "convex"]).default("memory"),
  CONVEX_URL: z.string().url().optional(),
  // Model tiers (D6): Lite = haiku, Pro = sonnet; deep variants may diverge
  // after Phase 0 benchmarking.
  ASTRA_LITE_MODEL: z.string().default(DEFAULT_LITE_MODEL),
  ASTRA_PRO_MODEL: z.string().default(DEFAULT_PRO_MODEL),
  ASTRA_DEEP_LITE_MODEL: z.string().optional(),
  ASTRA_DEEP_PRO_MODEL: z.string().optional(),
  // Turn budgets mirror the legacy step budgets (lite 5 / pro 10).
  ASTRA_LITE_MAX_TURNS: z.coerce.number().int().positive().default(5),
  ASTRA_PRO_MAX_TURNS: z.coerce.number().int().positive().default(10),
  ASTRA_DEEP_MAX_TURNS: z.coerce.number().int().positive().default(24),
  // HITL hold-window before interrupting the run (plan §5.3, ~45s).
  AGENTS_HOLD_WINDOW_MS: z.coerce.number().int().positive().default(45_000),
  // Stream bridge flush cadence (plan §4.3, ~250ms / N chars).
  AGENTS_STREAM_FLUSH_MS: z.coerce.number().int().positive().default(250),
  AGENTS_STREAM_FLUSH_CHARS: z.coerce.number().int().positive().default(800),
  AGENTS_MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(4),
  // Session cwd must stay stable across restarts for SDK session resume.
  AGENTS_SESSION_CWD: z.string().optional(),
  // External providers (ported from packages/convex env surface).
  EXA_API_KEY: z.string().optional(),
  JINA_API_KEY: z.string().optional(),
  OPENALEX_API_KEY: z.string().optional(),
  CROSSREF_MAILTO: z.string().optional(),
  DAYTONA_API_KEY: z.string().optional(),
  DAYTONA_STATVERIFY_SNAPSHOT: z.string().optional(),
});

export type AgentsConfig = {
  port: number;
  serviceToken: string | undefined;
  allowUnauthenticated: boolean;
  storeBackend: "memory" | "convex";
  convexUrl: string | undefined;
  anthropicApiKey: string | undefined;
  models: {
    chatLite: string;
    chatPro: string;
    deepLite: string;
    deepPro: string;
  };
  maxTurns: { lite: number; pro: number; deep: number };
  holdWindowMs: number;
  streamFlushMs: number;
  streamFlushChars: number;
  maxConcurrentRuns: number;
  /** Stable cwd for SDK sessions + .claude/skills discovery. */
  appRoot: string;
  providers: {
    exaApiKey: string | undefined;
    jinaApiKey: string | undefined;
    openAlexApiKey: string | undefined;
    crossrefMailto: string | undefined;
    daytonaApiKey: string | undefined;
    daytonaSnapshot: string | undefined;
  };
};

export function defaultAppRoot(): string {
  // src/config.ts → apps/agents (the directory holding .claude/skills).
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

export function loadConfig(
  env: Record<string, string | undefined> = process.env,
): AgentsConfig {
  const parsed = envSchema.parse(env);
  return {
    port: parsed.AGENTS_PORT,
    serviceToken: parsed.AGENTS_SERVICE_TOKEN?.trim() || undefined,
    allowUnauthenticated: parsed.AGENTS_ALLOW_UNAUTHENTICATED,
    storeBackend: parsed.AGENTS_STORE,
    convexUrl: parsed.CONVEX_URL,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    models: {
      chatLite: parsed.ASTRA_LITE_MODEL,
      chatPro: parsed.ASTRA_PRO_MODEL,
      deepLite: parsed.ASTRA_DEEP_LITE_MODEL ?? parsed.ASTRA_LITE_MODEL,
      deepPro: parsed.ASTRA_DEEP_PRO_MODEL ?? parsed.ASTRA_PRO_MODEL,
    },
    maxTurns: {
      lite: parsed.ASTRA_LITE_MAX_TURNS,
      pro: parsed.ASTRA_PRO_MAX_TURNS,
      deep: parsed.ASTRA_DEEP_MAX_TURNS,
    },
    holdWindowMs: parsed.AGENTS_HOLD_WINDOW_MS,
    streamFlushMs: parsed.AGENTS_STREAM_FLUSH_MS,
    streamFlushChars: parsed.AGENTS_STREAM_FLUSH_CHARS,
    maxConcurrentRuns: parsed.AGENTS_MAX_CONCURRENT_RUNS,
    appRoot: parsed.AGENTS_SESSION_CWD ?? defaultAppRoot(),
    providers: {
      exaApiKey: parsed.EXA_API_KEY,
      jinaApiKey: parsed.JINA_API_KEY,
      openAlexApiKey: parsed.OPENALEX_API_KEY,
      crossrefMailto: parsed.CROSSREF_MAILTO,
      daytonaApiKey: parsed.DAYTONA_API_KEY,
      daytonaSnapshot: parsed.DAYTONA_STATVERIFY_SNAPSHOT,
    },
  };
}

/** Chat model for an agent tier. */
export function chatModelForAgent(
  config: AgentsConfig,
  agentKind: "lite" | "pro",
): string {
  return agentKind === "pro" ? config.models.chatPro : config.models.chatLite;
}

/** Deep-research model for an agent tier. */
export function deepModelForAgent(
  config: AgentsConfig,
  agentKind: "lite" | "pro",
): string {
  return agentKind === "pro" ? config.models.deepPro : config.models.deepLite;
}
