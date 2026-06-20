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
/** Pengambil token Clerk (server: `auth().getToken()`; client: `useAuth().getToken()`). */
export type TokenGetter = () => Promise<string | null | undefined>;

/**
 * Factory client Eden Treaty. Bila `getToken` diberikan, setiap request menyuntik
 * `Authorization: Bearer <token>` via custom `fetcher` (token diambil fresh
 * per-request — aman untuk RSC per-request maupun hook client). Tanpa `getToken`
 * → client tanpa auth (mis. /ping publik).
 */
export function createApiClient(url: string, getToken?: TokenGetter) {
  if (!getToken) return treaty<App>(url);
  // Cast ke `typeof fetch`: file ini di-typecheck di dua konteks lib (bun-types
  // vs lib.dom) yang berbeda soal properti statis `fetch.preconnect`; cast lewat
  // `unknown` menghindari ketidakcocokan struktural di keduanya tanpa menyentuh
  // properti yang hanya ada di salah satu lib.
  const fetcher = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const token = await getToken();
    const headers = new Headers(init?.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }) as unknown as typeof fetch;
  return treaty<App>(url, { fetcher });
}

export type ApiClient = ReturnType<typeof createApiClient>;
