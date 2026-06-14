"use client";

import { api } from "@aqsha/convex/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexMutationFn } from "@/lib/convex-query";
import { promptForSdkBackend } from "@/features/thread-experience/api/use-thread-experience-data";

type StartResearchOptions = {
  busyKey?: string;
  onSuccess?: () => void | Promise<void>;
};

// Start a deep-research thread from any discovery/detail surface and route to
// it. Keep rate-limit, error, busy, and navigation semantics in one place so
// card grids and reader pages do not drift.
export function useStartResearch() {
  const router = useRouter();
  const startThread = useConvexMutationFn(api.agent.startThread);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startResearch = async (content: string, options: StartResearchOptions = {}) => {
    if (busyKey) return;
    setBusyKey(options.busyKey ?? "default");
    setError(null);
    try {
      const result = await startThread({
        // No commandId here; deep research is encoded as a /deep prompt.
        content: promptForSdkBackend(content, "deep-research"),
        agentKind: "pro",
      });
      if (result?.ok && "threadId" in result && result.threadId) {
        await options.onSuccess?.();
        router.push(`/app/threads/${result.threadId}`);
        return;
      }
      const rateLimited =
        !!result &&
        !result.ok &&
        "reason" in result &&
        result.reason === "rate_limited";
      setError(
        rateLimited
          ? "Batas pengiriman tercapai. Coba lagi sebentar lagi."
          : "Riset tidak bisa dimulai sekarang. Coba lagi nanti.",
      );
      setBusyKey(null);
    } catch (caught) {
      setError(readableConvexErrorMessage(caught, "Gagal memulai riset."));
      setBusyKey(null);
    }
  };

  return { startResearch, busy: Boolean(busyKey), busyKey, error };
}
