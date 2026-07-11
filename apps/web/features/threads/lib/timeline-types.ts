// Tipe presentasi timeline chat — NETRAL runtime (tak terikat adapter tertentu). Dipakai bersama
// oleh komponen render (message-list, tool-row, chat-artifact-card) dan adapter per-runtime
// (mastra-timeline), supaya komponen render tak perlu tahu bentuk chunk runtime.

/** Status tampil satu tool-call. */
export type ToolStatus = "running" | "pending" | "completed" | "failed" | "denied";

/** Satu baris scalar (allow-by-type) di body tool-row, dikelompokkan masukan/hasil. */
export type ToolRow = {
  key: string;
  label: string;
  value: string;
  group: "input" | "output";
};

/**
 * Sumber sebagai kartu — kontrak presentasi netral (favicon konsisten, tanpa OG image). Diisi dari
 * hasil tool `search_*` (stream/rehydrate) ATAU baris `research_sources` (DB, `citationNumber`).
 * Adapter di `lib/source-card.ts`.
 */
export type SourceCardData = {
  /** Kunci dedup + react-key stabil (doi/url/arxivId/judul atau id baris DB). */
  key: string;
  title: string;
  url: string | null;
  doi: string | null;
  /** Kelas sumber: "web" | "arxiv" | "doi" → ikon + label. */
  origin: string;
  snippet?: string;
  /** Nomor sitasi `[n]` — hanya jalur DB deep (chat normal/live = undefined). */
  citationNumber?: number | null;
};

/** Satu sub-agen pencarian (`/deep` step `search-literature`) — satu kartu per sub-pertanyaan. */
export type DeepSubSearch = {
  index: number;
  subQuestion: string;
  /** "running" selagi sub-agen bekerja; "completed" saat selesai. */
  status: ToolStatus;
  /** Sumber live yang dipancarkan step saat sub-agen selesai (`writer.write`). Fallback: DB. */
  sources?: SourceCardData[];
};

/** Satu kolom hasil `profile_dataset` (parse defensif output `aqsha_stats` `profile`). */
export type DatasetProfileColumn = {
  name: string;
  /** Tipe terdeteksi Python ("numeric" | "categorical" | "text") — bebas string (defensif). */
  type: string;
  /** Jumlah sel kosong kolom ini (0 bila tak terbaca). */
  missing: number;
  /** Rentang Likert terdeteksi ("1-5"/"1-7") — undefined bila bukan Likert. */
  likert?: string;
};

/** Ringkasan profil dataset untuk kartu chat — field opsional: yang tak terbaca disembunyikan UI. */
export type DatasetProfileSummary = {
  /** Jumlah baris dataset (`meta.n`) — undefined bila tak terbaca. */
  rowCount?: number;
  columns: DatasetProfileColumn[];
};

/**
 * Detail proses satu langkah Workflow `/deep` (body expandable tool-row "Proses"). Diisi dari
 * chunk `workflow-step-output` (live), snapshot step output (refresh poll), atau `metadata.deepProcess`
 * (riwayat). `kind:"search"` (deep) membawa sumber live per sub-pertanyaan + fallback DB via
 * `subQuestionIndex`; `kind:"search-flat"` (chat normal) = kartu hasil satu tool `search_*`.
 * `kind:"analysis"`/`"dataset-profile"` (chat normal, fase A statistik) = kartu run analisis /
 * kartu dataset menggantikan tool-row generik (nama union historis `/deep`, dipakai lintas chat).
 */
export type DeepStepDetail =
  | { kind: "plan"; plan: string; subQuestions: string[] }
  | { kind: "search"; subSearches: DeepSubSearch[] }
  | { kind: "search-flat"; sources: SourceCardData[] }
  | { kind: "text"; text: string }
  | { kind: "citations"; count: number }
  | {
      kind: "analysis";
      /** Id analisis katalog, atau "custom" untuk run_python_analysis ("" selagi args streaming). */
      analysis: string;
      /** Judul manusiawi run — label META / judul kustom; kartu memakai judul grup DB bila ada. */
      title: string;
      /** Ringkasan args mapping kolom (mis. "X1: X1.1–X1.5 · Y: Y.1–Y.4"), best-effort dari input. */
      argsSummary?: string;
      artifactId?: string;
      credits: number;
      /** runKey tersanitasi (`toRunKey`, mirror agent) — tautan ke panel scoped (fase B). */
      runKey: string;
      /** Tool settle dengan `ok:false` → kartu error (note ramah dari tool). */
      failed?: boolean;
      note?: string;
    }
  | { kind: "dataset-profile"; artifactId: string; profile: DatasetProfileSummary };

/** Model presentasi satu tool-row (collapsible). Default-deny: hanya scalar yang lolos. */
export type ToolRowModel = {
  toolCallId: string;
  /** Nama tool mentah (mis. "search_web") — dipakai memilih ikon semantik. */
  name: string;
  title: string;
  kind: "tool-call" | "subagent-call" | "load-skill" | "unknown";
  status: ToolStatus;
  isRunning: boolean;
  /** Ringkasan inline (mis. "12 hasil") dari output. */
  description?: string;
  /** Body rows curated (scalar saja). Kosong → render header-only. */
  rows: ToolRow[];
  /** Detail proses `/deep` (rencana, kartu sub-agen pencarian, bukti tandingan, dll.). */
  detail?: DeepStepDetail;
  /** Epoch-ms mulai step (snapshot Workflow `steps[id].startedAt`) — anchor timer lintas-refresh. */
  startedAt?: number;
  /** Akumulasi teks JSON arg yang masih mengalir (`tool-call-delta`, IMP-11) — internal reducer. */
  argsTextRaw?: string;
};

/** Model kartu artifact dari output `propose_artifact` yang sukses. */
export type ArtifactCardModel = {
  toolCallId: string;
  artifactId: string;
  title: string;
  artifactType: string;
};

/** Satu bagian terurut dalam timeline satu pesan asisten. */
export type TimelinePart =
  | { kind: "text"; id: string; text: string; streaming: boolean }
  | { kind: "reasoning"; id: string; text: string; thinking: boolean }
  | { kind: "tool"; id: string; model: ToolRowModel }
  | { kind: "artifact"; id: string; model: ArtifactCardModel };

/** Pesan ter-normalisasi untuk renderer (user = bubble; assistant = parts terurut). */
export type TimelineMessage = {
  id: string;
  role: "assistant" | "user";
  /** True selagi turn pesan ini masih streaming. */
  streaming: boolean;
  /** Runtime turn id — dipakai memetakan sumber riset (`research_sources.turnId`) ke turn. */
  turnId?: string;
  /** Epoch-ms pesan dibuat — memetakan lampiran upload (artifact `createdAt`) ke pesan user
   * (join sisi-baca per jendela waktu antar-pesan). 0 bila tak diketahui. */
  createdAt: number;
  /** Id artifact lampiran yang DIKIRIM bersama pesan ini (hanya pesan optimistik sesi ini). Bila ada,
   * dipakai langsung untuk menampilkan kartu lampiran live — EKSAK, tanpa menebak via jendela waktu
   * (lihat `bucketMessageAttachments`). Pesan rehydrate tak punya ini → pakai jendela waktu server. */
  attachmentIds?: string[];
  /** Sumber bernomor laporan `/deep` (dari `metadata.deepProcess.sources`) — fallback DB-independen
   * untuk pill `[n]` + panel "Sumber" saat fetch `research_sources` live meleset (lihat
   * `messageSourceCards`). Hanya pesan laporan `/deep` rehydrate. */
  reportSources?: SourceCardData[];
  parts: TimelinePart[];
};
