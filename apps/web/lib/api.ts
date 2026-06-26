import { createApiClient } from "@aqsha/api/client";

// Eden Treaty: type-safe client end-to-end dari type App api (tanpa codegen).
// Client di-build di dalam api (createApiClient) supaya elysia/eden satu instance.
// P0 belum inject token Clerk (auth landing P1).
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export const api = createApiClient(baseUrl);
