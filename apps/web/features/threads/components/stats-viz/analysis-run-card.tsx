"use client";

import {
  type StatsGroup,
  statsAnalysisMeta,
  summarizeStatsGroup,
} from "@aqsha/chat-core/stats-viz";
import { Badge } from "@aqsha/ui/components/badge";
import { ChartColumnIcon, CheckCircle2Icon, XCircleIcon } from "@aqsha/ui/icons";
import { useEffect, useState } from "react";
import type { DeepStepDetail, ToolRowModel } from "../../lib/timeline-types";
import { ElapsedLabel } from "../elapsed-label";
import { StatsVerdictChips, statsCountsLabel } from "./stats-summary";

type AnalysisDetail = Extract<DeepStepDetail, { kind: "analysis" }>;

/**
 * Kartu run analisis statistik — identitas momen analisis di chat, menggantikan tool-row
 * generik `run_analysis`/`run_python_analysis` (fase A plan statistik-panel):
 * - Running: judul uji + ringkasan mapping + badge kredit + elapsed berdetak; uji berat
 *   (SEM/mediasi) memakai copy bertahap supaya bootstrap 1–2 menit tak terasa hang.
 * - Sukses: "struk" ringkas — chip verdict agregat + jumlah tabel/gambar, dihitung dari grup
 *   blok DB (`statsGroupsByToolCallId`, D10 — BUKAN parsing output tool; anti-forgery gratis).
 *   Grup belum ter-fetch (jendela invalidasi) → struk tanpa chip, degrade mulus.
 * - Gagal / `ok:false`: kartu error dengan note ramah tool (blocked kredit / mapping kolom).
 * `onOpen` (fase B: buka panel Statistik scoped) belum di-wire → struk non-klik yang rapi.
 */
export function AnalysisRunCard({
  model,
  detail,
  group,
  onOpen,
}: {
  model: ToolRowModel;
  detail: AnalysisDetail;
  /** Grup blok DB milik toolCallId ini — sumber judul final + chip verdict. */
  group?: StatsGroup;
  /** Fase B: buka panel Statistik scoped runKey ini. Absen → struk non-interaktif. */
  onOpen?: () => void;
}) {
  const title = group?.title ?? detail.title;
  if (model.isRunning) return <RunningCard detail={detail} title={title} />;
  if (model.status === "failed" || model.status === "denied" || detail.failed) {
    return <FailedCard detail={detail} title={title} />;
  }
  return <ReceiptRow title={title} group={group} onOpen={onOpen} />;
}

/** Copy tahap-2 uji berat — hint durasi jujur per uji supaya user tak mengira macet. */
const HEAVY_HINTS: Record<string, string> = {
  sem_pls: "SEM-PLS: bootstrap ±1–2 menit",
  cb_sem: "CB-SEM: estimasi model ±1–2 menit",
  uji_mediasi: "bootstrap 5000 sampel ±1 menit",
};

/**
 * True setelah `seconds` detik sejak mount (bila `enabled`) — penanda transisi copy tahap-2 kartu
 * uji berat. Satu `setTimeout` yang menyala sekali, BUKAN interval per-detik: elapsed yang berdetak
 * sudah dimiliki `ElapsedLabel`, jadi kita hanya butuh momen ambang, bukan angka tiap detik.
 */
function useElapsedThreshold(seconds: number, enabled: boolean): boolean {
  const [reached, setReached] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setReached(true), seconds * 1000);
    return () => clearTimeout(timer);
  }, [enabled, seconds]);
  return enabled && reached;
}

function RunningCard({ detail, title }: { detail: AnalysisDetail; title: string }) {
  return (
    <div className="my-0.5 flex min-w-0 flex-col gap-1 rounded-xl border bg-muted/20 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <ChartColumnIcon className="size-3.5 shrink-0 text-primary" />
        <span className="min-w-0 truncate font-medium text-foreground">{title}</span>
        <CreditsBadge credits={detail.credits} />
      </div>
      {detail.argsSummary ? (
        <p className="break-words text-[12px] text-muted-foreground leading-4">
          {detail.argsSummary}
        </p>
      ) : null}
      <RunningStatus detail={detail} />
    </div>
  );
}

function RunningStatus({ detail }: { detail: AnalysisDetail }) {
  // Uji berat = flag META ATAU kredit ≥ 20 (jaring pengaman bila META tertinggal).
  const heavy = Boolean(statsAnalysisMeta(detail.analysis)?.heavy) || detail.credits >= 20;
  const pastBoot = useElapsedThreshold(10, heavy);
  // Copy bertahap uji berat (pola copy per-fase /deep): sandbox boot dulu, lalu hint durasi.
  const base = !heavy
    ? "Menghitung"
    : !pastBoot
      ? "Menyiapkan sandbox"
      : `Menghitung (${HEAVY_HINTS[detail.analysis] ?? "uji berat — bisa 1–2 menit"})`;
  return (
    <span className="text-[12px]">
      <ElapsedLabel base={base} />
    </span>
  );
}

function ReceiptRow({
  title,
  group,
  onOpen,
}: {
  title: string;
  group?: StatsGroup;
  onOpen?: () => void;
}) {
  const summary = group ? summarizeStatsGroup(group) : undefined;
  const body = (
    <>
      <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
      <span className="min-w-0 break-words font-medium text-foreground">{title}</span>
      {summary ? <StatsVerdictChips summary={summary} /> : null}
      {summary ? (
        <span className="shrink-0 text-[12px] text-muted-foreground">
          {statsCountsLabel(summary.tables, summary.figures)}
        </span>
      ) : null}
    </>
  );
  if (!onOpen) {
    return <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="-mx-1.5 flex w-full min-w-0 flex-wrap items-start gap-x-2 gap-y-1 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Buka di panel Statistik"
    >
      {body}
    </button>
  );
}

function FailedCard({ detail, title }: { detail: AnalysisDetail; title: string }) {
  return (
    <div className="my-0.5 flex min-w-0 flex-col gap-1 rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <XCircleIcon className="size-3.5 shrink-0 text-red-500" />
        <span className="min-w-0 truncate font-medium text-foreground">{title}</span>
        <span className="shrink-0 text-[11px] text-red-500">tidak berjalan</span>
      </div>
      <p className="break-words text-[12.5px] text-muted-foreground leading-5">
        {detail.note ?? "Analisis gagal dijalankan. Minta Astra mencoba lagi."}
      </p>
      {detail.argsSummary ? (
        <p className="break-words text-[12px] text-muted-foreground/70 leading-4">
          {detail.argsSummary}
        </p>
      ) : null}
    </div>
  );
}

function CreditsBadge({ credits }: { credits: number }) {
  if (credits <= 0) return null;
  return (
    <Badge
      variant="secondary"
      className="shrink-0 rounded-full bg-muted/60 px-2 py-0 font-medium text-[11px] text-muted-foreground"
    >
      {credits} kredit
    </Badge>
  );
}
