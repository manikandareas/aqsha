// Tipe presentasi timeline chat — NETRAL runtime (tak bergantung eve / Mastra). Dipakai bersama
// oleh komponen render (message-list, tool-row, chat-artifact-card) dan adapter per-runtime
// (mastra-timeline). Sebelumnya hidup di `eve-timeline.ts`; diekstrak saat cutover Mastra supaya
// penghapusan adapter eve tak memutus jalur Mastra.

/** Status tampil satu tool-call. */
export type ToolStatus = "running" | "pending" | "completed" | "failed" | "denied";

/** Satu baris scalar (allow-by-type) di body tool-row, dikelompokkan masukan/hasil. */
export type ToolRow = {
  key: string;
  label: string;
  value: string;
  group: "input" | "output";
};

/** Satu sub-agen pencarian (`/deep` step `search-literature`) — satu kartu per sub-pertanyaan. */
export type DeepSubSearch = {
  index: number;
  subQuestion: string;
  /** "running" selagi sub-agen bekerja; "completed" saat selesai. */
  status: ToolStatus;
};

/**
 * Detail proses satu langkah Workflow `/deep` (body expandable tool-row "Proses"). Diisi dari
 * chunk `workflow-step-output` (live), snapshot step output (refresh poll), atau `metadata.deepProcess`
 * (riwayat). Untuk `kind:"search"`, daftar sumber per sub-pertanyaan di-resolve terpisah dari
 * `research_sources` (di-join via `subQuestionIndex` saat render).
 */
export type DeepStepDetail =
  | { kind: "plan"; plan: string; subQuestions: string[] }
  | { kind: "search"; subSearches: DeepSubSearch[] }
  | { kind: "text"; text: string }
  | { kind: "citations"; count: number };

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
  parts: TimelinePart[];
};
