import { createApiClient as createTreatyClient } from "@aqsha/api/eden";
import { getApiBaseUrl } from "@/lib/api-url";

export function createApiClient(
  apiUrl = getApiBaseUrl(),
): ReturnType<typeof createTreatyClient> {
  return createTreatyClient(apiUrl, {
    fetch: {
      credentials: "include",
    },
  });
}

export const api = createApiClient();
