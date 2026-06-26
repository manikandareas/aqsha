"use client";

import { ThreadDetailShell } from "@/features/thread-experience/components/thread-detail-shell";

export function ThreadView({ threadId }: { threadId: string }) {
  return <ThreadDetailShell threadId={threadId} />;
}
