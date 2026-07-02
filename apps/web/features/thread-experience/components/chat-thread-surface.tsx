"use client";

import { MastraChatThreadSurface } from "./mastra-chat-thread-surface";
import type { ThreadSummary } from "./component-types";
import type { RateStatus } from "../types";

/**
 * Surface chat thread — wrapper tipis di atas `MastraChatThreadSurface`; parent (shell/panel)
 * memakai komponen ini. Props legacy (title/rateStatus/threads/draftContextLabel) masih diterima
 * demi kompat call-site, TAPI diabaikan: history via Mastra Memory, billing/quota via processor
 * server, sumber via API `research_sources`. Konteks @mention via provider (lihat
 * useComposerSelection).
 */
export function ChatThreadSurface({
  threadId,
  isLoading = false,
  compact = false,
  seed,
}: {
  threadId?: string;
  isLoading?: boolean;
  compact?: boolean;
  seed?: string;
  // Props legacy — diterima (kompat call-site) tapi diabaikan.
  title?: string;
  rateStatus?: RateStatus;
  threads?: ThreadSummary[];
  draftContextLabel?: string;
}) {
  return (
    <MastraChatThreadSurface
      threadId={threadId}
      isLoading={isLoading}
      compact={compact}
      seed={seed}
    />
  );
}
