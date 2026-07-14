/**
 * Icon boundary for apps/svelte (plan §2 "Icon", §6 icon contract).
 *
 * App code (everything except vendored `src/lib/components/ui/**`) imports icons
 * from `$lib/icons` so the Aqsha name→glyph mapping lives in one place. Direct
 * `@lucide/svelte` imports are banned by eslint (see eslint.config.js).
 *
 * shadcn-svelte vendored components import `@hugeicons/svelte` directly because
 * `components.json.iconLibrary` is `hugeicons`; that is expected for vendored
 * code and needs no rewrite (Phase 1 spike finding — see the decision record).
 *
 * Phase 3 fills this out to mirror apps/web `@aqsha/ui/icons` (Lucide-compatible
 * names backed by the official Hugeicons packages). This starter exposes the
 * render component plus one confirmed glyph as the pattern to follow.
 */
export { HugeiconsIcon as Icon } from '@hugeicons/svelte';

// Pattern: re-export named glyphs with Aqsha-facing names.
// e.g. `import { Icon, CheckIcon } from '$lib/icons';` then `<Icon icon={CheckIcon} />`.
export { Tick02Icon as CheckIcon } from '@hugeicons/core-free-icons';
