"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useSettingsSecurityData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const capabilities = useQuery(
    api.auth.getSecurityCapabilities,
    isAuthenticated ? {} : "skip",
  );

  return { viewer, capabilities };
}
