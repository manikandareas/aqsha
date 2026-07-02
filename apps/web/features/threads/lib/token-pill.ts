import { cn } from "@/lib/utils";

/**
 * SSOT kelas visual token inline (chip `/command` + `@mention`) — dipakai composer
 * (`composer-inline-editor.ts`, chip DOM murni) dan bubble pesan user
 * (`message-list.tsx`, React) supaya keduanya SATU bahasa visual: chip pill sejati
 * (bg lembut + border + rounded, tanpa underline), warna per JENIS token —
 * command = lavender, mention = mint (token aksen theme-aware `globals.css`).
 * Tone dibedakan per PERMUKAAN karena latarnya beda: composer di atas `bg-card`
 * (varian `-soft` yang di-mix ke card), bubble di atas `bg-primary` (overlay alpha
 * hue langsung; teks mewarisi `text-primary-foreground` bubble).
 */

/**
 * Bentuk dasar pill. `leading-4` + `py-px` + border 1px ≈ tinggi 20px; `my-0.5`
 * memberi jeda antar-baris saat pill wrap (margin vertikal inline-flex ikut
 * memperluas line box) — tanpa itu baris pill 18px menempel di line-height 18px.
 */
const TOKEN_PILL_SHAPE =
  "my-0.5 inline-flex max-w-56 items-baseline rounded-md border px-1 py-px leading-4";

const TOKEN_PILL_TONE = {
  composer: {
    command:
      "cursor-pointer select-none border-lavender-soft-border bg-lavender-soft font-medium text-lavender-foreground transition-colors duration-150 hover:bg-lavender/25",
    mention:
      "cursor-pointer select-none border-mint-soft-border bg-mint-soft text-mint-foreground transition-colors duration-150 hover:bg-mint/25",
  },
  bubble: {
    command: "border-lavender/45 bg-lavender/25 font-medium",
    mention: "border-mint/45 bg-mint/25",
  },
} as const;

export type TokenPillSurface = keyof typeof TOKEN_PILL_TONE;
export type TokenPillKind = keyof (typeof TOKEN_PILL_TONE)["composer"];

export function tokenPillClass(surface: TokenPillSurface, kind: TokenPillKind) {
  return cn(TOKEN_PILL_SHAPE, TOKEN_PILL_TONE[surface][kind]);
}

/** Glyph prefix (`/`, `@`, `❝`) — diredupkan & tak ikut ter-truncate. */
export const TOKEN_PILL_PREFIX_CLASS = "shrink-0 opacity-70";

/**
 * Teks label — truncation CSS (label penuh tetap utuh di data/tooltip). `min-w-0`
 * wajib: sebagai anak flex, span default `min-width:auto` tak mau menyusut di bawah
 * min-content → `truncate` (`overflow:hidden`) tak pernah aktif & label meluber
 * melewati `max-w-56`. (Pola sama dipakai di composer.tsx / file-chip.tsx.)
 */
export const TOKEN_PILL_LABEL_CLASS = "min-w-0 truncate";

/**
 * Pisahkan glyph prefix dari teks label (`/matriks` → `/` + `matriks`,
 * `@Skripsi` → `@` + `Skripsi`, `❝ 3 blok` → `❝` + ` 3 blok`). Label tanpa
 * prefix dikenal → prefix kosong (render span prefix dilewati).
 */
export function splitTokenLabel(label: string): { prefix: string; text: string } {
  const first = label.charAt(0);
  if (first === "/" || first === "@" || first === "❝") {
    return { prefix: first, text: label.slice(1) };
  }
  return { prefix: "", text: label };
}
