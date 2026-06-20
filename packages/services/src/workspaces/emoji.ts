// Generator emoji workspace deterministik — di-port dari V1
// (packages/convex/convex/workspaces/emoji.ts). Di P1 hanya generator yang
// dipakai (cold-start default workspace); validasi emoji user landing P2.

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
