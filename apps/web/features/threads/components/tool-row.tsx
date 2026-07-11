"use client";

import { messagePreview } from "@aqsha/chat-core";
import { Badge } from "@aqsha/ui/components/badge";
import {
  BookmarkIcon,
  BookOpenIcon,
  ChartColumnIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  Library,
  NotebookIcon,
  PencilIcon,
  PenLineIcon,
  Quote,
  Scale,
  SearchIcon,
  ShieldCheckIcon,
  TelescopeIcon,
  Trash2Icon,
  WrenchIcon,
  XCircleIcon,
} from "@aqsha/ui/icons";
import type { StatsGroup } from "@aqsha/chat-core/stats-viz";
import { useEffect, useRef, useState } from "react";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { STATS_SANDBOX_TOOLS } from "../lib/stats-run-detail";
import type {
  DeepStepDetail,
  ToolRow as ToolRowData,
  ToolRowModel,
  ToolStatus,
} from "../lib/timeline-types";
import type { ResearchSource } from "../types";
import { DeepSearchCards, SourceCardList } from "./deep-search-cards";
import { ElapsedLabel } from "./elapsed-label";
import { useMessageInteractions } from "./message-interactions";
import { ScrollDetailTrigger } from "./scroll-detail-trigger";
import { AnalysisRunCard } from "./stats-viz/analysis-run-card";
import { DatasetProfileCard } from "./stats-viz/dataset-profile-card";

// Ikon semantik per tool (kosmetik — data: `model.name` selalu ada). Switch mengembalikan
// JSX konkret (bukan komponen dinamis) supaya lolos react-compiler. Tool tak dikenal → wrench.
function ToolGlyph({ name, className }: { name: string; className?: string }) {
  switch (name) {
    // ── Langkah deep-research (`name` = stepId) — tiap fase ikon khasnya sendiri ──
    case "draft-plan":
      return <NotebookIcon className={className} />;
    case "approve-plan":
      return <CheckCircle2Icon className={className} />;
    case "search-literature":
      return <Library className={className} />;
    case "counter-evidence":
      return <Scale className={className} />;
    case "assign-citations":
      return <Quote className={className} />;
    case "analyze-sources":
      return <ChartColumnIcon className={className} />;
    case "verify-citations":
    case "verify_citations":
    case "verify_identifiers":
      return <ShieldCheckIcon className={className} />;
    case "synthesize":
      return <PencilIcon className={className} />;
    // ── Tool normal ──
    case "search_web":
      return <GlobeIcon className={className} />;
    case "search_thread_documents":
      return <SearchIcon className={className} />;
    case "search_papers":
    case "lookup_doi":
    case "search_arxiv":
      return <BookOpenIcon className={className} />;
    case "list_artifacts":
    case "get_artifact":
    case "get_render_payload":
      return <FileTextIcon className={className} />;
    case "list_workspaces":
    case "create_workspace":
    case "rename_workspace":
    case "link_to_workspace":
      return <FolderIcon className={className} />;
    case "save_url":
      return <BookmarkIcon className={className} />;
    case "propose_artifact":
    case "execute_artifact":
      return <PenLineIcon className={className} />;
    case "delete_artifact":
      return <Trash2Icon className={className} />;
    default:
      return <WrenchIcon className={className} />;
  }
}

// Afordans live/gagal selalu menang: running → spinner; failed/denied → silang; selain
// itu → ikon semantik per nama tool (fallback wrench). Delegasi subagent (kind
// "subagent-call") pakai teleskop agar terbaca sebagai riset terdelegasi.
function ToolStatusIcon({
  status,
  name,
  kind,
  className,
}: {
  status: ToolStatus;
  name: string;
  kind?: ToolRowModel["kind"];
  className?: string;
}) {
  if (status === "running") {
    return <Spinner className={cn(className, "text-primary")} />;
  }
  if (status === "failed") {
    return <XCircleIcon className={cn(className, "text-red-500")} />;
  }
  if (status === "denied") {
    return <XCircleIcon className={cn(className, "text-muted-foreground")} />;
  }
  if (kind === "subagent-call") {
    return <TelescopeIcon className={cn(className, "text-muted-foreground")} />;
  }
  return <ToolGlyph name={name} className={cn(className, "text-muted-foreground")} />;
}

// Ambang "nilai scalar panjang": di atas ini, baris tool biasa dipromosikan dari teks-inline ke
// preview + panel step (nilai penuh terbaca di panel). Di bawahnya tetap teks polos (kontrak: 1 baris
// pendek = teks, tanpa box scroll). ~2 baris pada lebar transkrip.
const INLINE_VALUE_MAX = 160;
// Batas descriptor kueri di HEADER selagi running (satu baris) — beda peran dari `INLINE_VALUE_MAX`
// (promosi body): header selalu dipendekkan, nilai penuh tetap terbaca di panel step.
const LIVE_QUERY_MAX = 120;

function toneClass(status: ToolStatus): string {
  switch (status) {
    case "running":
    case "completed":
      return "text-foreground";
    case "failed":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}

/**
 * Satu pemanggilan alat sebagai baris collapsible.
 * Collapsed: ikon status + judul (Shimmer + kueri inline selagi running) + badge
 * hasil. Expanded: scalar curated (default-deny via adapter) dikelompokkan Masukan
 * / Hasil. Tool tanpa body scalar = baris polos.
 *
 * Auto-open selagi aktif, auto-collapse saat settle — kecuali user menggeser manual
 * (override sticky).
 */
export function ToolRow({
  model,
  sourcesBySubQ,
  turnId,
  statsGroup,
}: {
  model: ToolRowModel;
  /** Sumber `/deep` per `subQuestionIndex` (untuk detail step `search-literature`). */
  sourcesBySubQ?: Map<number, ResearchSource[]>;
  /** Run id `/deep` pesan ini — men-scope panel rencana/pencarian per-run. */
  turnId?: string;
  /** Grup blok hasil analisis milik toolCallId ini (dari `analysis_result_blocks`) — chip struk. */
  statsGroup?: StatsGroup;
}) {
  // Kartu statistik menggantikan baris generik SELURUHNYA (identitas momen analisis, fase A).
  // Dispatch TANPA hook: detail bisa berubah kind saat settle (running generik → kartu dataset),
  // hook di baris generik harus hidup di komponen terpisah (rules-of-hooks).
  const detail = model.detail;
  if (detail?.kind === "analysis") {
    return <AnalysisRunCard model={model} detail={detail} group={statsGroup} />;
  }
  if (detail?.kind === "dataset-profile") {
    return <DatasetProfileCard detail={detail} />;
  }
  return <GenericToolRow model={model} sourcesBySubQ={sourcesBySubQ} turnId={turnId} />;
}

function GenericToolRow({
  model,
  sourcesBySubQ,
  turnId,
}: {
  model: ToolRowModel;
  sourcesBySubQ?: Map<number, ResearchSource[]>;
  turnId?: string;
}) {
  const { openStep, openPlan } = useMessageInteractions();
  const detail = model.detail;
  const hasBody = model.rows.length > 0 || Boolean(detail);
  const inputRows = model.rows.filter((row) => row.group === "input");
  const outputRows = model.rows.filter((row) => row.group === "output");
  // Descriptor inline selagi running: kueri (tool) atau tugas (subagent, key "message"). Dipendekkan
  // untuk tampilan header saja (nilai scalar kini disimpan penuh → terbaca utuh di panel step).
  const liveQueryRaw = model.isRunning
    ? model.rows.find((row) => row.key === "query" || row.key === "message")?.value
    : undefined;
  // Clamp codepoint-safe bersama (`messagePreview`) — bukan `slice` yang membelah surrogate pair.
  const liveQuery = liveQueryRaw ? messagePreview(liveQueryRaw, LIVE_QUERY_MAX) : undefined;
  // Ada nilai scalar panjang → promosikan body tool biasa ke preview + panel (bukan dibiarkan
  // terpotong/menggembung inline). Pendek → tetap teks polos di bawah.
  const hasLongScalar = model.rows.some((row) => row.value.length > INLINE_VALUE_MAX);

  // Tabel scalar Masukan/Hasil — IDENTIK untuk varian preview-panel (nilai panjang →
  // ScrollDetailTrigger) maupun teks-polos (pendek); hanya pembungkus + `DeepDetailBody` (di-narrow
  // per-cabang) yang beda.
  const scalarRows = (
    <>
      <ToolRowSection label="Masukan" rows={inputRows} />
      <ToolRowSection
        label="Hasil"
        rows={outputRows}
        tone={model.status === "failed" ? "danger" : "default"}
      />
    </>
  );

  // null = ikut auto (open == isRunning); boolean = pilihan manual user yang sticky.
  const [override, setOverride] = useState<boolean | null>(null);
  const prevRunning = useRef(model.isRunning);
  useEffect(() => {
    // Reset override saat transisi running → settle agar auto-collapse berlaku lagi
    // untuk user yang tak pernah menggeser.
    if (prevRunning.current && !model.isRunning) setOverride((cur) => (cur === true ? cur : null));
    prevRunning.current = model.isRunning;
  }, [model.isRunning]);
  const open = override ?? model.isRunning;

  // Subagent task-mode (kind "subagent-call") berjalan di child-session sendiri yang event-nya
  // TIDAK di-forward ke stream induk (childSessionId 0 baris) → induk diam 2–3 mnt = "frozen" semu.
  // Elapsed berdetak (M:SS) menggantikan rasa beku selagi subagent bekerja. Tool biasa = Shimmer.
  // Tool sandbox statistik (profile_dataset — boot sandbox bisa lama; run_* fallback tanpa
  // detail) ikut elapsed dengan alasan sama.
  const isSubagentRunning =
    model.isRunning && (model.kind === "subagent-call" || STATS_SANDBOX_TOOLS.has(model.name));
  const header = (
    <span className={cn("flex min-w-0 items-start gap-1.5 leading-5", toneClass(model.status))}>
      <ToolStatusIcon
        status={model.status}
        name={model.name}
        kind={model.kind}
        className="mt-0.5 size-3.5 shrink-0"
      />
      <span className="min-w-0">
        {isSubagentRunning ? (
          <ElapsedLabel base={model.title} startedAt={model.startedAt} />
        ) : model.isRunning ? (
          <Shimmer as="span">{model.title}</Shimmer>
        ) : (
          <span>{model.title}</span>
        )}
        {liveQuery ? <span className="text-muted-foreground"> · {liveQuery}</span> : null}
      </span>
    </span>
  );

  const resultBadge = model.description ? (
    <Badge
      variant="secondary"
      className="mt-px shrink-0 rounded-full bg-muted/60 px-2 py-0 font-medium text-[11px] text-muted-foreground"
    >
      {model.description}
    </Badge>
  ) : null;

  if (!hasBody) {
    return (
      <div className="flex min-w-0 items-start gap-1.5">
        {header}
        {resultBadge}
      </div>
    );
  }

  return (
    <Collapsible className="min-w-0" open={open} onOpenChange={(next) => setOverride(next)}>
      <CollapsibleTrigger className="-mx-1.5 group flex w-full min-w-0 items-start gap-1.5 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {header}
        {resultBadge}
        <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-focus-visible:opacity-100 group-data-[state=open]:rotate-180 group-data-[state=open]:opacity-100" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        {detail && detail.kind === "search" ? (
          // Step pencarian deep: tiap kartu sub-agen jadi trigger panel sendiri (preview + buka panel).
          <div className="mt-1.5 text-[12px]">
            <DeepSearchCards
              subSearches={detail.subSearches}
              sourcesBySubQ={sourcesBySubQ}
              turnId={turnId}
            />
          </div>
        ) : detail && detail.kind === "search-flat" ? (
          // Hasil tool `search_*` chat normal → preview, klik buka panel step (sumber → URL).
          <ScrollDetailTrigger
            className="mt-1.5"
            onOpen={openStep ? () => openStep(model.toolCallId) : undefined}
          >
            <div className="text-[12px]">
              <SourceCardList sources={detail.sources} />
            </div>
          </ScrollDetailTrigger>
        ) : detail && detail.kind === "plan" ? (
          // Rencana → preview, klik buka panel rencana penuh (+ sub-pertanyaan & aksi gate).
          <ScrollDetailTrigger
            className="mt-1.5"
            onOpen={openPlan && turnId ? () => openPlan(turnId) : undefined}
          >
            <div className="p-2 text-[12px]">
              <DeepDetailBody detail={detail} />
            </div>
          </ScrollDetailTrigger>
        ) : detail && detail.kind === "text" ? (
          // Prosa panjang (bukti tandingan / verifikasi / analisis bukti) → preview, klik buka
          // panel step penuh.
          <ScrollDetailTrigger
            className="mt-1.5"
            onOpen={openStep ? () => openStep(model.toolCallId) : undefined}
          >
            <div className="p-2 text-[12px]">
              <DeepDetailBody detail={detail} />
            </div>
          </ScrollDetailTrigger>
        ) : hasLongScalar ? (
          // Tool biasa dengan nilai panjang → preview, klik buka panel step (nilai PENUH terbaca di
          // panel) — konsisten dengan rencana/teks deep, tak ada lagi "…" buntu yang tak terbaca.
          <ScrollDetailTrigger
            className="mt-1.5"
            onOpen={openStep ? () => openStep(model.toolCallId) : undefined}
          >
            <div className="grid gap-2 p-2 text-[12px]">
              {scalarRows}
              {detail ? <DeepDetailBody detail={detail} /> : null}
            </div>
          </ScrollDetailTrigger>
        ) : (
          // Sitasi (teks sebaris) & tool biasa pendek: polos tanpa box scroll — sesuai kontrak.
          <div className="mt-1.5 grid gap-2 text-[12px]">
            {scalarRows}
            {detail ? <DeepDetailBody detail={detail} /> : null}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Body detail proses `/deep` non-search (rencana, bukti tandingan, verifikasi, sitasi). Kasus
 * `search` ditangani langsung di `ToolRow` (kartu sub-agen ber-scroll sendiri, tak dibungkus).
 */
function DeepDetailBody({
  detail,
}: {
  detail: Exclude<DeepStepDetail, { kind: "search" | "search-flat" }>;
}) {
  switch (detail.kind) {
    case "plan":
      return (
        <div className="grid gap-2">
          {detail.plan ? (
            <p className="whitespace-pre-wrap break-words text-muted-foreground leading-5">
              {detail.plan}
            </p>
          ) : null}
          {detail.subQuestions.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">
              {detail.subQuestions.map((q, i) => (
                <li key={`${i}-${q.slice(0, 24)}`}>{q}</li>
              ))}
            </ul>
          ) : null}
        </div>
      );
    case "text":
      return (
        <p className="whitespace-pre-wrap break-words text-muted-foreground leading-5">
          {detail.text}
        </p>
      );
    case "citations":
      return (
        <p className="text-muted-foreground">
          {detail.count > 0
            ? `${detail.count} sumber diberi nomor sitasi [n].`
            : "Belum ada sumber bernomor."}
        </p>
      );
    default:
      return null;
  }
}

function ToolRowSection({
  label,
  rows,
  tone = "default",
}: {
  label: string;
  rows: ToolRowData[];
  tone?: "default" | "danger";
}) {
  if (rows.length === 0) return null;
  return (
    <dl className="grid gap-1">
      <dt className="font-medium text-[11px] text-muted-foreground/70">{label}</dt>
      {rows.map((row) => (
        <div key={row.key} className="flex min-w-0 gap-1.5">
          <dt className="shrink-0 text-muted-foreground">{row.label}:</dt>
          <dd
            className={cn(
              "min-w-0 break-words",
              tone === "danger" ? "text-red-500" : "text-foreground",
            )}
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
