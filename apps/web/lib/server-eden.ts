import "server-only";

import { createApiClient as createTreatyClient } from "@aqsha/api/eden";
import { headers } from "next/headers";
import { getApiBaseUrl } from "@/lib/api-url";

export async function createServerApiClient(
  apiUrl = getApiBaseUrl(),
): Promise<ReturnType<typeof createTreatyClient>> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");

  return createTreatyClient(apiUrl, {
    fetch: {
      credentials: "include",
    },
    headers: cookie
      ? {
          cookie,
        }
      : undefined,
  });
}
