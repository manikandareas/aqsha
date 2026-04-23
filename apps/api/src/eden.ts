import { treaty } from "@elysiajs/eden";
import type { ApiApp } from "./app";

export function createApiClient(apiUrl: string) {
  return treaty<ApiApp>(apiUrl);
}
