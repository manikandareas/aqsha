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
  continuationToken?: string | null; // resume handle eve (rehydrate initialSession saat lanjut thread)
  // Recovery pesan terkirim yang turn-nya belum settle (baseline template) — bubble user
  // optimistik lintas-reload; di-null-kan klien saat ada event settled setelah `_createdAt`.
  pendingUserMessage?: string | null;
  pendingUserMessageCreatedAt?: number | null;
  lastActivityAt: number;
  createdAt: number;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  threadId: string;
  ownerUserId: string;
  role: string; // "user" | "assistant" | "system"
  text: string;
  reasoning: string | null;
  status: string; // "streaming" | "complete" | "error"
  turnId: string | null;
  createdAt: number;
};

/**
 * Event stream eve mentah persisted (fix timeline persist) — di-replay lewat
 * `defaultMessageReducer` untuk merekonstruksi timeline penuh saat reload + poll progress
 * in-flight. `payload` = `HandleMessageStreamEvent` utuh. Struktural — cocok shape Eden.
 */
export type ChatThreadEvent = {
  id: number;
  threadId: string;
  ownerUserId: string;
  eventIndex: number; // posisi stream eve (1:1) → cursor resume = max(eventIndex)+1
  type: string;
  turnId: string | null;
  payload: unknown;
  createdAt: number;
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
  createdAt: number;
};

/** Judul tampil thread (fallback bila belum ada/auto-title belum jalan). */
export const threadTitle = (t: Pick<ChatThread, "title">): string =>
  t.title?.trim() ? t.title : "Percakapan baru";
