// Tipe lokal thread/message untuk komponen (struktural — cocok dengan shape yang
// di-infer Eden dari api). Sengaja TIDAK import @aqsha/db agar drizzle tak masuk
// bundle client.

export type ChatThread = {
  id: string;
  ownerUserId: string;
  title: string | null;
  titleStatus: string | null; // "generating" | "ready" | null
  status: string; // "idle" | "streaming" | "failed"
  agentKind: string; // "lite" | "pro"
  workspaceId?: string | null;
  lastMessagePreview: string | null;
  lastActivityAt: number;
  pinnedAt: number | null; // null = tak disematkan; nilai ⇒ disematkan (kunci urut grup "Disematkan")
  createdAt: number;
  updatedAt: number;
};

/** Sumber riset yang dipersist tool Astra (Slice 6.4) — panel Sources. */
export type ResearchSource = {
  id: string;
  threadId: string;
  turnId: string;
  citationNumber: number | null;
  origin: string; // "web" | "arxiv" | "doi"
  provider: string | null;
  title: string;
  locator: string;
  url: string | null;
  doi: string | null;
  arxivId: string | null;
  snippet: string;
  evidenceStrength: string; // "strong" | "medium" | "weak"
  discoveryQuery: string | null;
  /** Index sub-pertanyaan `/deep` yang menemukan sumber (null di chat biasa) — pengelompokan kartu. */
  subQuestionIndex: number | null;
  subQuestionText: string | null;
  /** OG image (best-effort) untuk kartu sumber (null bila tak ada). */
  imageUrl: string | null;
  createdAt: number;
};

/** Judul tampil thread (fallback bila belum ada/auto-title belum jalan). */
export const threadTitle = (t: Pick<ChatThread, "title">): string =>
  t.title?.trim() ? t.title : "Percakapan baru";
