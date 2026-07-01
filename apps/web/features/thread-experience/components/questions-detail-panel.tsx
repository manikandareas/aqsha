"use client";

import { QuestionsForm } from "@/features/threads/components/questions-card";
import { DetailPanelShell } from "./detail-panel-chrome";
import { useThreadPanel, useThreadPanelData } from "./thread-panel-context";

/**
 * Panel klarifikasi (`ask_questions`) — form pertanyaan yang SAMA dengan kartu inline, dirender di
 * panel kanan. `questions` + `resolve`/`skip` di-resolve dari lookups (di-inject surface saat gate
 * aktif). Menjawab dari sini menutup gate (kartu inline + panel keduanya unmount).
 */
export function QuestionsDetailPanel() {
  const panel = useThreadPanel();
  const lookups = useThreadPanelData();
  const ask = lookups?.ask ?? null;
  const onClose = panel?.closePanel;

  if (!ask || ask.questions.length === 0) {
    return (
      <DetailPanelShell eyebrow="Klarifikasi" title="Pertanyaan" onClose={onClose}>
        <p className="text-[13px] text-muted-foreground">
          Tidak ada pertanyaan klarifikasi yang menunggu jawaban.
        </p>
      </DetailPanelShell>
    );
  }

  const resolve = ask.resolve;
  const skip = ask.skip;

  return (
    <DetailPanelShell eyebrow="Klarifikasi" title="Pertanyaan" onClose={onClose}>
      <QuestionsForm
        questions={ask.questions}
        onSubmit={(resume) => {
          resolve?.(resume);
          onClose?.();
        }}
        onSkip={() => {
          skip?.();
          onClose?.();
        }}
      />
    </DetailPanelShell>
  );
}
