"use client";

import { api } from "@aqsha/convex/api";
import { useConvexQueryData } from "@/lib/convex-query";
import { useConvexAuth } from "convex/react";

export function useSettingsOverviewData() {
  const { isAuthenticated } = useConvexAuth();
  const current = useConvexQueryData(
    api.billing.current.get,
    isAuthenticated ? {} : "skip",
  );
  const activity = useConvexQueryData(
    api.billing.usage.activity,
    isAuthenticated ? { days: 365 } : "skip",
  );
  const threads = useConvexQueryData(
    api.agent.queries.listThreads,
    isAuthenticated ? {} : "skip",
  );

  return {
    current,
    activity,
    threadCount: threads?.length,
  };
}
