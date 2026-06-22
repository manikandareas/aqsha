"use client";

import {
  useBillingCurrent,
  useBillingPlans,
  useProfile,
  useUsageActivity,
} from "@/features/settings/api";
import { useThreadsList } from "@/features/threads/api";

export function useSettingsOverviewData() {
  const current = useBillingCurrent();
  const activity = useUsageActivity(365);
  const threads = useThreadsList();
  const threadCount = (threads.data?.pages ?? []).reduce(
    (count, page) => count + page.items.length,
    0,
  );

  return {
    current: current.data,
    activity: activity.data,
    threadCount: threads.isLoading ? undefined : threadCount,
  };
}

export function useSettingsAccountData() {
  const profile = useProfile();
  return { profile: profile.data, isLoading: profile.isLoading };
}

export function useSettingsUsageBillingData(days = 90) {
  const current = useBillingCurrent();
  const activity = useUsageActivity(days);
  const plans = useBillingPlans();
  return {
    current: current.data,
    activity: activity.data,
    plans: plans.data,
    isLoading: current.isLoading || activity.isLoading || plans.isLoading,
  };
}

export function useSettingsSecurityData() {
  const profile = useProfile();
  return { profile: profile.data };
}
