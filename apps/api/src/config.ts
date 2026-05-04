import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_ORIGIN: z.url().default("http://localhost:3000"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
    BETTER_AUTH_URL: z.url().default("http://localhost:3001"),
    DATABASE_URL: z
      .string()
      .min(
        1,
        "DATABASE_URL is required to initialize the PostgreSQL connection.",
      ),
    ASTRA_USER_ID: z.string().min(1).default("local-user"),
    ASTRA_WORKSPACE: z.string().min(1).default("local"),
    ASTRA_MODEL: z.string().min(1).default("gpt-5.2"),
    ASTRA_ALLOWED_MODELS: z
      .string()
      .min(1)
      .default("gpt-5.2,gpt-5.2-pro,gpt-5.4,gpt-5.4-pro,gpt-5.4-mini,o3,o4-mini"),
    OPENAI_REASONING_EFFORT: z
      .enum(["none", "minimal", "low", "medium", "high", "xhigh"])
      .optional(),
    OPENAI_REASONING_SUMMARY: z.enum(["auto", "detailed"]).optional(),
    OPENAI_TEXT_VERBOSITY: z.enum(["low", "medium", "high"]).optional(),
    OPENAI_FORCE_REASONING: z.coerce.boolean().default(false),
    ASTRA_SKILLS_ROOTS: z.string().min(1).default("./skills"),
    ASTRA_EXA_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export function appRoot(): string {
  return new URL("..", import.meta.url).pathname.replace(/\/$/, "");
}

export function resolveAppPath(path: string): string {
  if (path.startsWith("/")) {
    return path;
  }

  return new URL(`../${path}`, import.meta.url).pathname;
}
