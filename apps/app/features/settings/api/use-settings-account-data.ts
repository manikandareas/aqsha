"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useSettingsAccountData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");

  return {
    viewer,
    current,
    isLoading: isAuthenticated && (!viewer || !current),
  };
}
