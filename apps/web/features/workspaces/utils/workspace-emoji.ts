// Emoji tampilan untuk workspace. Fallback `📁` dipakai saat workspace belum
// punya emoji (beda dari `DEFAULT_WORKSPACE_EMOJI` di services yang `📚` untuk
// seeding). Satu sumber supaya list, picker, dan panel switcher konsisten.
export const WORKSPACE_EMOJI_FALLBACK = "📁";

export const workspaceEmoji = (emoji?: string | null) => emoji ?? WORKSPACE_EMOJI_FALLBACK;
