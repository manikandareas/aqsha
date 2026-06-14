"use client";

import { api } from "@aqsha/convex/api";
import { useConvexQueryData } from "@/lib/convex-query";
import { useConvexAuth } from "convex/react";

export function useSettingsSecurityData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(
    api.auth.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );

  return { viewer };
}
