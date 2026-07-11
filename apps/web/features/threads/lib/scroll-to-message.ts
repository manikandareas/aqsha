/**
 * Scroll the transcript to an assistant message by id — the "Lihat di percakapan" bridge from
 * the Statistik panel back to a run's tool call. Anchors are `data-message-id` on each assistant
 * row (`message-list`). No-op when the element isn't mounted (message paged out / SSR).
 */
export function scrollToMessage(messageId: string): void {
  if (typeof document === "undefined") return;
  const selector = `[data-message-id="${CSS.escape(messageId)}"]`;
  const el = document.querySelector(selector);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}
