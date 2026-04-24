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
    ANTHROPIC_API_KEY: z.string().min(1),
    QDRANT_URL: z.string().url(),
    QDRANT_API_KEY: z.string().min(1),
    EXA_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    AGENT_EMBEDDING_MODEL: z.string().min(1).default("text-embedding-3-small"),
    AGENT_DEFAULT_MODEL: z.string().min(1).default("claude-sonnet-4-6"),
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
