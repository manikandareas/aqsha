"use client";

import { useMutation } from "@tanstack/react-query";

import { completeGetStarted } from "@/features/onboarding/lib/api";

export function useCompleteGetStartedMutation() {
  return useMutation({
    mutationFn: completeGetStarted,
  });
}
