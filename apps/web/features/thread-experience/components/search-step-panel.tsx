"use client";

import { searchKey } from "@/features/threads/lib/thread-panel-data";
import { DetailPanelShell } from "./detail-panel-chrome";
import { SourceLinkList } from "./source-link-list";
import { useThreadPanelData } from "./thread-panel-context";

/**
 * Sub-question trace panel — one `/deep` sub-question with the sources it surfaced.
 * Each source links out to its URL. Resolves the step by (run, index) from the lookups.
 */
export function SearchStepPanel({
  turnId,
  subQuestionIndex,
}: {
  turnId: string;
  subQuestionIndex: number;
}) {
  const lookups = useThreadPanelData();
  const step = lookups?.searches.get(searchKey(turnId, subQuestionIndex)) ?? null;

  if (!step) {
    return (
      <DetailPanelShell
        eyebrow={`Sub-pertanyaan ${subQuestionIndex + 1}`}
        title="Pencarian"
      >
        <p className="text-[13px] text-muted-foreground">
          Detail pencarian ini belum tersedia. Coba lagi setelah riset selesai diproses.
        </p>
      </DetailPanelShell>
    );
  }

  return (
    <DetailPanelShell
      eyebrow={`Sub-pertanyaan ${step.index + 1}`}
      title={step.subQuestion}
    >
      <SourceLinkList sources={step.sources} />
    </DetailPanelShell>
  );
}
