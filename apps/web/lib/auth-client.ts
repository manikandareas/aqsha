"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { Auth } from "@aqsha/api/auth";
import { getApiBaseUrl } from "@/lib/api-url";

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
  fetchOptions: {
    credentials: "include",
  },
  plugins: [inferAdditionalFields<Auth>()],
});
