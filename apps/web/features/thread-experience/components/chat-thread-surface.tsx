"use client";

import { MastraChatThreadSurface } from "./mastra-chat-thread-surface";
import type { ThreadSummary } from "./component-types";
import type { RateStatus } from "../types";

/**
 * Surface chat thread — runtime **Mastra** (cutover eve→Mastra selesai; runtime eve dihapus).
 * Parent (shell/panel) memakai komponen ini → meneruskan ke `MastraChatThreadSurface`. Props
 * eve-legacy (title/rateStatus/threads/draftContextLabel) masih diterima demi kompat call-site,
 * TAPI tak dipakai jalur Mastra (history via Mastra Memory, billing/quota via processor server,
 * sumber via API `research_sources`). Konteks @mention kini via provider (lihat useComposerSelection).
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
  // Props eve-legacy — diterima (kompat call-site) tapi diabaikan jalur Mastra.
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
