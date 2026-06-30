"use client";

import { DetailPanelShell } from "./detail-panel-chrome";
import { SourceLinkList } from "./source-link-list";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * All sources collected for one assistant message (opened from the "Sumber" trigger).
 * Each item links out to its URL — no single-source detail.
 */
export function SourcesListPanel({ messageId }: { messageId: string }) {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const sources = lookups?.messageSources.get(messageId) ?? [];

  return (
    <DetailPanelShell
      eyebrow={sources.length > 0 ? `${sources.length} sumber` : undefined}
      title="Sumber"
      onClose={panel?.closePanel}
    >
      <SourceLinkList sources={sources} />
    </DetailPanelShell>
  );
}
