import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    VERCEL_AI_SDK_PORT: z.coerce.number().int().positive().default(8002),
    VERCEL_AI_SDK_HOST: z.string().min(1).default("127.0.0.1"),
    ASTRA_INTERNAL_TOKEN: z.string().optional(),
    ASTRA_USER_ID: z.string().min(1).default("local-user"),
    ASTRA_WORKSPACE: z.string().min(1).default("local"),
    ASTRA_MODEL: z.string().min(1).default("gpt-5.2"),
    ASTRA_ALLOWED_MODELS: z.string().min(1).default("gpt-5.2,gpt-5.2-pro,gpt-5.4,gpt-5.4-pro,gpt-5.4-mini,o3,o4-mini"),
    OPENAI_REASONING_EFFORT: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
    OPENAI_REASONING_SUMMARY: z.enum(["auto", "detailed"]).optional(),
    OPENAI_TEXT_VERBOSITY: z.enum(["low", "medium", "high"]).optional(),
    OPENAI_FORCE_REASONING: z.coerce.boolean().default(false),
    ASTRA_SKILLS_ROOTS: z.string().min(1).default("./skills"),
    ASTRA_ENABLE_SKILL_SCRIPTS: z.coerce.boolean().default(false),
    ASTRA_SKILL_SCRIPT_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
    ASTRA_RESEARCH_ARTIFACT_DIR: z.string().min(1).default(".astra-artifacts"),
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
