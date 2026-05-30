"use client";

import { api } from "@aqsha/convex/api";
import { useConvexAuth, useConvexQueryData } from "@/lib/convex-query";

export function useSettingsSecurityData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  return { viewer };
}
