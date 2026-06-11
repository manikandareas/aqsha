import { stripMentionMarkers } from "./context/mentionMarkers";

// Default title for a thread with no user/generated title yet. Single source of
// truth — also used by agent/threads.ts and agent/messages.ts.
export const DEFAULT_THREAD_TITLE = "Thread baru";

const MAX_THREAD_TITLE_LENGTH = 80;
const BLOCKED_GENERATED_TITLES = new Set([
  "request for thread title generation",
  "thread title generation",
  "generate thread title",
  "title generation request",
]);

export function threadTitleFromPrompt(content: string) {
  const title = stripMentionMarkers(content).replace(/\s+/g, " ").trim();
  if (title.length <= MAX_THREAD_TITLE_LENGTH) {
    return title || DEFAULT_THREAD_TITLE;
  }

  const slice = title.slice(0, MAX_THREAD_TITLE_LENGTH - 3).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const prefix = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${prefix}...`;
}

export function shouldUsePromptTitle(title: string | undefined) {
  return !title || title === DEFAULT_THREAD_TITLE;
}

export function normalizeGeneratedThreadTitle(title: string) {
  return threadTitleFromPrompt(
    title
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

export function isUsableGeneratedThreadTitle(title: string) {
  const normalized = normalizeGeneratedThreadTitle(title);
  const lower = normalized.toLowerCase().replace(/\.+$/g, "").trim();
  return (
    normalized !== DEFAULT_THREAD_TITLE &&
    !BLOCKED_GENERATED_TITLES.has(lower) &&
    !lower.startsWith("request for ")
  );
}
