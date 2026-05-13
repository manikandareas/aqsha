"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";

export function useSettingsOverviewData() {
  const { isAuthenticated } = useConvexAuth();
  const current = useQuery(api.billing.current.get, isAuthenticated ? {} : "skip");
  const activity = useQuery(api.billing.usage.activity, isAuthenticated ? { days: 365 } : "skip");
  const threadPage = useQuery(
    api.agent.threads.list,
    isAuthenticated ? { paginationOpts: { cursor: null, numItems: 50 } } : "skip",
  );

  return {
    current,
    activity,
    threadCount: threadPage?.page.length,
  };
}
