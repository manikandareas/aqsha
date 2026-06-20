import { createApiClient } from "@aqsha/api-v2/client";

// Eden Treaty: type-safe client end-to-end dari type App api-v2 (tanpa codegen).
// Client di-build di dalam api-v2 (createApiClient) supaya elysia/eden satu instance.
// P0 belum inject token Clerk (auth landing P1).
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = createApiClient(baseUrl);
