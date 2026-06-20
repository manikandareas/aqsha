// Generator + validator emoji workspace — di-port dari V1
// (packages/convex/convex/workspaces/emoji.ts). Generator dipakai cold-start
// (P1); validator `normalizeWorkspaceEmoji` dipakai `WorkspaceService.update` (P2).

import { throwAppError } from "@aqsha/db";

export const DEFAULT_WORKSPACE_EMOJI = "📚";

const WORKSPACE_EMOJIS = [
  "📚",
  "🧠",
  "🔬",
  "🧪",
  "📝",
  "📌",
  "🗂️",
  "📎",
  "💡",
  "🎯",
  "🚀",
  "🌱",
  "🌐",
  "🧭",
  "🛰️",
  "⚙️",
  "🧩",
  "📊",
  "📈",
  "🧾",
  "🖋️",
  "🔍",
  "🏛️",
  "🧬",
  "🗺️",
  "📦",
  "🪄",
  "🏗️",
  "🔖",
  "🛠️",
  "🧰",
  "📖",
  "✏️",
  "🗒️",
  "💬",
  "🤝",
] as const;

export function randomWorkspaceEmoji(seed: string | number): string {
  const seedValue = String(seed);
  let hash = 2166136261;
  for (const character of seedValue) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return WORKSPACE_EMOJIS[Math.abs(hash) % WORKSPACE_EMOJIS.length] ?? DEFAULT_WORKSPACE_EMOJI;
}

export function workspaceEmojiForNewWorkspace(args: {
  ownerUserId: string;
  name: string;
  now: number;
}): string {
  return randomWorkspaceEmoji(`${args.ownerUserId}:${args.name}:${args.now}`);
}

const emojiLikePattern =
  /[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Regional_Indicator}]/u;

/**
 * Validasi emoji user (port V1): single grapheme, emoji-like, tanpa
 * whitespace/control char, ≤32 byte. Invalid → `appError` (message/code persis V1).
 */
export function normalizeWorkspaceEmoji(value: string): string {
  const emoji = value.trim();
  if (
    !emoji ||
    emoji.length > 32 ||
    hasControlCharacter(emoji) ||
    /\s/u.test(emoji) ||
    !emojiLikePattern.test(emoji) ||
    countGraphemes(emoji) !== 1
  ) {
    throwInvalidWorkspaceEmoji();
  }
  return emoji;
}

export function isValidStoredWorkspaceEmoji(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    normalizeWorkspaceEmoji(value);
    return true;
  } catch {
    return false;
  }
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}

function countGraphemes(value: string): number {
  if ("Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    return Array.from(segmenter.segment(value)).length;
  }
  return Array.from(value).length;
}

function throwInvalidWorkspaceEmoji(): never {
  throwAppError({
    message: "Emoji workspace tidak valid.",
    code: "workspace_emoji_invalid",
    severity: "warning",
    field: "emoji",
  });
}
