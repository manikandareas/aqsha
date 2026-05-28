"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";
import { useResolvedViewer } from "@/lib/use-viewer-identity";

export function useSettingsAccountData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const resolvedViewer = useResolvedViewer(viewer);

  return {
    viewer: resolvedViewer,
    isLoading: isAuthenticated && !viewer,
  };
}
