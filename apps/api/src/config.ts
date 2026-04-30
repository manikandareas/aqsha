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
    AGENTS_BASE_URL: z.url().default("http://127.0.0.1:8001"),
    ASTRA_INTERNAL_TOKEN: z
      .string()
      .min(1, "ASTRA_INTERNAL_TOKEN is required to call the agents service."),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
