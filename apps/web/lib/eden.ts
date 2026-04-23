import { createApiClient as createTreatyClient } from "@aqsha/api/eden";

const fallbackApiUrl = "http://localhost:3001";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl;
}

export function createApiClient(apiUrl = getApiBaseUrl()) {
  return createTreatyClient(apiUrl);
}

export const api = createApiClient();
