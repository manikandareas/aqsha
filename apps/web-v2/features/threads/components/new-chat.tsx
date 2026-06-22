"use client";

import { ChatSurface } from "./chat-surface";

/**
 * Surface chat BARU (Slice 6.1) — LIVE via `ChatSurface` (stream eve, tanpa history).
 * Saat turn pertama, URL bump ke `/app/threads/<id>` (komponen tetap mounted; lihat
 * `useAstraAgent.onSessionChange`). History persist lewat hook proyeksi; reload thread →
 * `ThreadView` (kini juga live, Slice 6.8).
 */
export function NewChat({ seed }: { seed?: string }) {
  return <ChatSurface initialText={seed} />;
}
