import "server-only";

import { headers } from "next/headers";

import { normalizeAgentThreadDetail } from "@/features/agents/lib/normalizers";
import type { AgentThreadDetail } from "@/features/agents/lib/types";
import { getApiBaseUrl } from "@/lib/api-url";

export async function getServerAgentThreadDetail(
  threadId: string,
): Promise<AgentThreadDetail | null> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");
  const response = await fetch(
    `${getApiBaseUrl().replace(/\/$/, "")}/agents/threads/${threadId}`,
    {
      cache: "no-store",
      headers: cookie ? { cookie } : undefined,
    },
  );

  if (!response.ok) {
    return null;
  }

  return normalizeAgentThreadDetail(await response.json());
}
