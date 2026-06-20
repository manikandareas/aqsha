import { treaty } from "@elysiajs/eden";
import type { App } from "./index";

/**
 * Factory client Eden Treaty. Sengaja hidup DI dalam api-v2 supaya `treaty<App>`
 * dan type `App` memakai instance `elysia` + `@elysiajs/eden` yang sama (satu peer
 * context) — menghindari mismatch type "two copies of elysia" lintas workspace.
 *
 * Type-only import App → tidak menarik runtime server ke bundle web-v2; hanya
 * @elysiajs/eden (isomorphic, fetch-based) yang ikut.
 */
export function createApiClient(url: string) {
  return treaty<App>(url);
}

export type ApiClient = ReturnType<typeof createApiClient>;
