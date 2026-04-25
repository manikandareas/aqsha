import { treaty } from "@elysiajs/eden";
import type { ApiApp } from "./app";

export function createApiClient(
  apiUrl: string,
  config?: Parameters<typeof treaty>[1],
): ReturnType<typeof treaty<ApiApp>> {
  return treaty<ApiApp>(apiUrl, config);
}
