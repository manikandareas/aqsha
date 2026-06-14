"use client";

import { api } from "@aqsha/convex/api";
import { useConvexQueryData } from "@/lib/convex-query";
import { useResolvedViewer } from "@/lib/use-viewer-identity";
import { useConvexAuth } from "convex/react";

export function useSettingsAccountData() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(
    api.auth.getCurrentUser,
    isAuthenticated ? {} : "skip",
  );
  const resolvedViewer = useResolvedViewer(viewer);

  return {
    viewer: resolvedViewer,
    isLoading: isAuthenticated && !viewer,
  };
}
