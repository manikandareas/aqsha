import { cn } from '$lib/utils';

/**
 * Shared visual classes for the inline token pill (`/command` chip + `@mention`) — used by the composer
 * (`composer-inline-editor.ts`, pure DOM chip) and the user message bubble (`message-list`) so both
 * speak ONE visual language: a true pill chip (soft bg + border + rounded, no underline), colored per
 * token KIND — command = lavender, mention = mint (theme-aware accent tokens in `globals.css`). Tone
 * differs per SURFACE because the background differs: composer over `bg-card` (the `-soft` variant
 * mixed into the card), bubble over `bg-primary` (direct hue alpha overlay; text inherits the bubble's
 * `text-primary-foreground`).
 */

/**
 * Base pill shape. `leading-4` + `py-px` + 1px border ≈ 20px tall; `my-0.5` gives spacing between
 * wrapped lines (an inline-flex's vertical margin extends the line box) — without it a row of 18px
 * pills sticks to the 18px line-height.
 */
const TOKEN_PILL_SHAPE =
	'my-0.5 inline-flex max-w-56 items-baseline rounded-md border px-1 py-px leading-4';

const TOKEN_PILL_TONE = {
	composer: {
		command:
			'cursor-pointer select-none border-lavender-soft-border bg-lavender-soft font-medium text-lavender-foreground transition-colors duration-150 hover:bg-lavender/25',
		mention:
			'cursor-pointer select-none border-mint-soft-border bg-mint-soft text-mint-foreground transition-colors duration-150 hover:bg-mint/25'
	},
	bubble: {
		command: 'border-lavender/45 bg-lavender/25 font-medium',
		mention: 'border-mint/45 bg-mint/25'
	}
} as const;

export type TokenPillSurface = keyof typeof TOKEN_PILL_TONE;
export type TokenPillKind = keyof (typeof TOKEN_PILL_TONE)['composer'];

export function tokenPillClass(surface: TokenPillSurface, kind: TokenPillKind) {
	return cn(TOKEN_PILL_SHAPE, TOKEN_PILL_TONE[surface][kind]);
}

/** Prefix glyph (`/`, `@`, `❝`) — dimmed and never truncated. */
export const TOKEN_PILL_PREFIX_CLASS = 'shrink-0 opacity-70';

/**
 * Label text — CSS truncation (the full label stays intact in data/tooltip). `min-w-0` is required:
 * as a flex child, a span's default `min-width:auto` refuses to shrink below min-content → `truncate`
 * (`overflow:hidden`) never kicks in & the label overflows past `max-w-56`. (Same pattern used in
 * composer / file-chip.)
 */
export const TOKEN_PILL_LABEL_CLASS = 'min-w-0 truncate';

/**
 * Split the prefix glyph from the label text (`/matriks` → `/` + `matriks`, `@Skripsi` → `@` +
 * `Skripsi`, `❝ 3 blok` → `❝` + ` 3 blok`). A label with no known prefix → empty prefix (the prefix
 * span render is skipped).
 */
export function splitTokenLabel(label: string): { prefix: string; text: string } {
	const first = label.charAt(0);
	if (first === '/' || first === '@' || first === '❝') {
		return { prefix: first, text: label.slice(1) };
	}
	return { prefix: '', text: label };
}
