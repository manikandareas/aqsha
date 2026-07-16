# @aqsha/ui-svelte

Aqsha design-system components for Svelte 5 — shadcn-svelte (bits-ui + tailwind-variants) restyled to the Aqsha UI system: 2px borders, keycap/lip depth, mint focus ring, warm-cream OKLCH palette.

Raw-source package: exports uncompiled `.svelte`/`.ts`; the consuming app's Vite/Svelte toolchain compiles it. Components are authored in runes mode.

## Consumer requirements

1. **CSS** — import both stylesheets before your app layers, and point Tailwind v4 at this package's sources (it does not auto-scan `node_modules`):

   ```css
   @import 'tailwindcss';
   @import 'tw-animate-css';
   @import '@aqsha/ui-svelte/styles/tokens.css';
   @import '@aqsha/ui-svelte/styles/components.css';
   @source '../path/to/node_modules/@aqsha/ui-svelte/src';
   ```

2. **tw-animate-css** — animation classes used by overlay components (dialog, popover, dropdown) come from `tw-animate-css`; the consumer must import it (this package does not ship it).

3. **Fonts** — tokens reference Inter, Fredoka, JetBrains Mono, and Caveat; the consumer self-hosts or loads them.

4. **Dark mode** — tokens use `@custom-variant dark (&:is(.dark *))`; toggle the `.dark` class (e.g. mode-watcher).

## Usage

```svelte
<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
</script>

<Button size="sm" variant="outline">Simpan</Button>
```

Token names follow shadcn-svelte (`--background`, `--primary`, `--ring`, `--radius-*`), with Aqsha accents (`--mint`, `--lavender`, `--coral`, `--lemon` + `-soft`/`-strong`/`-foreground` derivatives) and `--band`/`--band-ink` for the dark footer band.

State semantics: **mint = on/off** (checkbox, switch, solo toggle) · **ink/primary = exclusive choice** (radio, tabs, toggle group, pagination).
