"use client";

import { api } from "@aqsha/convex/api";
import { useConvexAuth, useConvexQueryData } from "@/lib/convex-query";
import { useResolvedViewer } from "@/lib/use-viewer-identity";

export function useSettingsAccountData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  const resolvedViewer = useResolvedViewer(viewer);

  return {
    viewer: resolvedViewer,
    isLoading: isAuthenticated && !viewer,
  };
}
