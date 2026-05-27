"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useSettingsSecurityData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const authConfig = useQuery(api.auth.publicAuthConfiguration, {});

  return { viewer, authConfig };
}
