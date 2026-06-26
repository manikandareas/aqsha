"use client";

import { useAuth } from "@clerk/nextjs";
import { useMemo } from "react";
import { createApiClient } from "@aqsha/api/client";

const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Client Eden ber-auth untuk Client Component (token via `useAuth().getToken`). */
export function useApi() {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(baseUrl, () => getToken()), [getToken]);
}
