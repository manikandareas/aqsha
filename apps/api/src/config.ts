import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    API_PORT: z.coerce.number().int().positive().default(3001),
    DATABASE_URL: z
      .string()
      .min(
        1,
        "DATABASE_URL is required to initialize the PostgreSQL connection.",
      ),
    CLERK_PUBLISHABLE_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    QDRANT_URL: z.string().url(),
    QDRANT_API_KEY: z.string().min(1),
    EXA_API_KEY: z.string().min(1).optional(),
    // Required: the research agent uses the OpenAI Agents SDK.
    OPENAI_API_KEY: z.string().min(1),
    AGENT_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
    // Per-phase model overrides. Light phases (planner, critic) default to
    // gpt-5-mini; heavy phases (researcher, synthesizer) default to gpt-5.
    AGENT_DEFAULT_MODEL: z.string().min(1).default("gpt-5"),
    AGENT_PLANNER_MODEL: z.string().min(1).default("gpt-5-mini"),
    AGENT_RESEARCHER_MODEL: z.string().min(1).default("gpt-5"),
    AGENT_CRITIC_MODEL: z.string().min(1).default("gpt-5-mini"),
    AGENT_SYNTHESIZER_MODEL: z.string().min(1).default("gpt-5"),
    AGENT_SYNTHESIZER_REVISION_MODEL: z
      .string()
      .min(1)
      .default("gpt-5"),
    AGENT_STANDARD_MAX_BUDGET_USD: z.coerce
      .number()
      .positive()
      .default(2),
    AGENT_DEEP_MAX_BUDGET_USD: z.coerce.number().positive().default(8),
    AGENT_STANDARD_TASK_BUDGET_TOKENS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    AGENT_DEEP_TASK_BUDGET_TOKENS: z.coerce
      .number()
      .int()
      .positive()
      .default(140_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
