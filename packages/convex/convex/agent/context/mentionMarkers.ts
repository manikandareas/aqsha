// Inline mention markers — the single source of truth. A sent user message keeps
// mention pills at the position the user typed them by wrapping each pill label in
// private-use-area sentinels (U+E000 / U+E001). The web message renderer splits on
// them to draw pills inline; UI-facing text (sidebar preview, generated thread
// title) strips them. The web client imports these via
// `@aqsha/convex/mention-markers` (see apps/web/lib/context-refs.ts).
export const MENTION_MARKER_OPEN = String.fromCharCode(0xe000);
export const MENTION_MARKER_CLOSE = String.fromCharCode(0xe001);

/** Remove inline mention markers, keeping the readable label inside. */
export function stripMentionMarkers(text: string): string {
  return text
    .split(MENTION_MARKER_OPEN)
    .join("")
    .split(MENTION_MARKER_CLOSE)
    .join("");
}
