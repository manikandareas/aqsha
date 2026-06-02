"use client";

import { api } from "@aqsha/convex/api";
import { useConvexAuth, useConvexQueryData } from "@/lib/convex-query";

export function useSettingsOverviewData() {
  const { isAuthenticated } = useConvexAuth();
  const current = useConvexQueryData(api.billing.current.get, isAuthenticated ? {} : "skip");
  const activity = useConvexQueryData(api.billing.usage.activity, isAuthenticated ? { days: 365 } : "skip");
  const threadPage = useConvexQueryData(
    api.agent.threads.list,
    isAuthenticated ? { paginationOpts: { cursor: null, numItems: 50 } } : "skip",
  );

  return {
    current,
    activity,
    threadCount: threadPage?.page.length,
  };
}
