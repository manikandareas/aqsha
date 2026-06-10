import { stripMentionMarkers } from "./context/mentionMarkers";

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
    return title || "Thread baru";
  }

  const slice = title.slice(0, MAX_THREAD_TITLE_LENGTH - 3).trimEnd();
  const lastSpace = slice.lastIndexOf(" ");
  const prefix = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return `${prefix}...`;
}

export function shouldUsePromptTitle(title: string | undefined) {
  return !title || title === "Thread baru";
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
    normalized !== "Thread baru" &&
    !BLOCKED_GENERATED_TITLES.has(lower) &&
    !lower.startsWith("request for ")
  );
}
