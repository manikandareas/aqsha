import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// Service configuration (plan §4.2 config.ts). Everything env-driven so model
// tiers and budgets can change without a code edit (decision D6).

const DEFAULT_LITE_MODEL = "claude-haiku-4-5";
const DEFAULT_PRO_MODEL = "claude-sonnet-4-6";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().optional(),
  // Anthropic-compatible gateway support (e.g. OpenRouter's Anthropic skin:
  // ANTHROPIC_BASE_URL=https://openrouter.ai/api + ANTHROPIC_AUTH_TOKEN=sk-or-…
  // with ANTHROPIC_API_KEY left empty). The SDK child process reads these
  // straight from the environment; config only validates presence.
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
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
  // Optional thinking budget for the Pro tier ("max effort" on reasoning
  // models behind an Anthropic-compatible gateway: the SDK's
  // maxThinkingTokens maps to the provider's reasoning effort/budget).
  ASTRA_PRO_MAX_THINKING_TOKENS: z.coerce.number().int().positive().optional(),
  // Turn budgets mirror the legacy step budgets (lite 5 / pro 10).
  ASTRA_LITE_MAX_TURNS: z.coerce.number().int().positive().default(5),
  ASTRA_PRO_MAX_TURNS: z.coerce.number().int().positive().default(10),
  ASTRA_DEEP_MAX_TURNS: z.coerce.number().int().positive().default(24),
  // Custom per-dispatch cost guard (the SDK has no maxBudgetUsd — plan §9.2
  // deviation #1). Applies to the cost accrued during ONE dispatch of a run;
  // a retry gets a fresh allowance and continues from the persisted phases.
  ASTRA_MAX_RUN_BUDGET_USD: z.coerce.number().positive().default(20),
  // Observability (plan §5.7): both are passed through to the SDK child
  // process via the inherited environment; set the OTLP endpoint alongside.
  CLAUDE_CODE_ENABLE_TELEMETRY: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  // Stream bridge flush cadence (plan §4.3, ~250ms / N chars).
  AGENTS_STREAM_FLUSH_MS: z.coerce.number().int().positive().default(250),
  AGENTS_STREAM_FLUSH_CHARS: z.coerce.number().int().positive().default(800),
  AGENTS_MAX_CONCURRENT_RUNS: z.coerce.number().int().positive().default(4),
  // Auto-retry a turn/phase whose stream dropped with a TRANSIENT connection
  // fault (network switch, gateway idle-timeout, socket reset). Exponential
  // backoff base→cap; 4 retries over ~2/4/8/15s covers a Wi-Fi handover. Set
  // AGENTS_STREAM_MAX_RETRIES=0 to disable.
  AGENTS_STREAM_MAX_RETRIES: z.coerce.number().int().nonnegative().default(4),
  AGENTS_STREAM_RETRY_BASE_MS: z.coerce.number().int().positive().default(2000),
  AGENTS_STREAM_RETRY_MAX_MS: z.coerce.number().int().positive().default(15000),
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
  anthropicBaseUrl: string | undefined;
  anthropicAuthToken: string | undefined;
  models: {
    chatLite: string;
    chatPro: string;
    deepLite: string;
    deepPro: string;
  };
  maxTurns: { lite: number; pro: number; deep: number };
  /** Per-dispatch run cost ceiling in USD (custom maxBudgetUsd replacement). */
  maxRunBudgetUsd: number;
  proMaxThinkingTokens: number | undefined;
  streamFlushMs: number;
  streamFlushChars: number;
  maxConcurrentRuns: number;
  /** Auto-retry budget + backoff for transient stream-connection drops. */
  streamMaxRetries: number;
  streamRetryBaseMs: number;
  streamRetryMaxMs: number;
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
    anthropicApiKey: parsed.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicBaseUrl: parsed.ANTHROPIC_BASE_URL,
    anthropicAuthToken: parsed.ANTHROPIC_AUTH_TOKEN?.trim() || undefined,
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
    maxRunBudgetUsd: parsed.ASTRA_MAX_RUN_BUDGET_USD,
    proMaxThinkingTokens: parsed.ASTRA_PRO_MAX_THINKING_TOKENS,
    streamFlushMs: parsed.AGENTS_STREAM_FLUSH_MS,
    streamFlushChars: parsed.AGENTS_STREAM_FLUSH_CHARS,
    maxConcurrentRuns: parsed.AGENTS_MAX_CONCURRENT_RUNS,
    streamMaxRetries: parsed.AGENTS_STREAM_MAX_RETRIES,
    streamRetryBaseMs: parsed.AGENTS_STREAM_RETRY_BASE_MS,
    streamRetryMaxMs: parsed.AGENTS_STREAM_RETRY_MAX_MS,
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
