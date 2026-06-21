// Tipe lokal thread/message untuk komponen (struktural — cocok dengan shape yang
// di-infer Eden dari api-v2). Sengaja TIDAK import @aqsha/db agar drizzle tak masuk
// bundle client.

export type ChatThread = {
  id: string;
  ownerUserId: string;
  title: string | null;
  titleStatus: string | null; // "generating" | "ready" | null
  status: string; // "idle" | "streaming" | "failed"
  agentKind: string; // "lite" | "pro"
  lastMessagePreview: string | null;
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

/** Judul tampil thread (fallback bila belum ada/auto-title belum jalan). */
export const threadTitle = (t: Pick<ChatThread, "title">): string =>
  t.title?.trim() ? t.title : "Percakapan baru";
