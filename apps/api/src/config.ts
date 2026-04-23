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
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
