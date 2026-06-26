import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createApiClient } from "@aqsha/api/client";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Client Eden ber-auth untuk Server Component / Route Handler. Token Clerk
 * di-scope per-request: `auth()` dipanggil sekali, `getToken()` dipanggil fresh
 * di tiap request fetcher. Pakai di RSC (mis. server-gate `/app`).
 */
export async function getServerApi() {
  const { getToken } = await auth();
  return createApiClient(baseUrl, () => getToken());
}
