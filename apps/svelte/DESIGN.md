---
name: Aqsha
description: A calm, warm-paper research-and-writing workspace for student researchers.
colors:
  paper-bg: "oklch(0.9195 0.0169 88.003)"
  paper-raised: "oklch(0.953 0.0156 86.4257)"
  ink: "oklch(0.235 0 0)"
  ink-strong: "oklch(0.3012 0 0)"
  ink-soft: "oklch(0.4688 0.0136 84.5932)"
  primary-foreground: "oklch(0.9169 0.0175 99.616)"
  tan-secondary: "oklch(0.8647 0.0201 87.5232)"
  muted: "oklch(0.834 0.0232 87.163)"
  line: "oklch(0.8434 0.0231 87.1621)"
  destructive: "oklch(0.5771 0.2152 27.325)"
  mint: "oklch(0.6863 0.1743 154)"
  lavender: "oklch(0.57 0.12 305)"
  coral: "oklch(0.6863 0.1743 34.2614)"
  lemon: "oklch(0.7057 0.025 82.0932)"
typography:
  display:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "clamp(2rem, 5vw, 4rem)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0"
  headline:
    fontFamily: "Instrument Serif, ui-serif, Georgia, serif"
    fontSize: "1.55rem"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0"
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.01em"
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: "0.01em"
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "0"
  hand:
    fontFamily: "Caveat, ui-serif, cursive"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink-strong}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.tan-secondary}"
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.paper-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-destructive:
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  card:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  chip-token:
    backgroundColor: "{colors.paper-raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
    height: "20px"
---

# Design System: Aqsha

## 1. Overview

**Creative North Star: "The Calm Study Desk"**

Aqsha looks like a tidy, warm desk where a student researcher can see everything in reach and nothing is shouting. The base is warm paper — a cream body (`oklch(0.92 0.017 88)`) with slightly raised paper cards — carrying charcoal ink text and a small family of soft-candy accent pills. It reads as a place to think and write, not a dashboard to monitor. Instrument Serif sets the headings and gives the surface a quiet editorial confidence; Inter does the honest work of UI and body; Caveat shows up like a pencil annotation for the rare human touch. The personality is **calm, clear, playful** — playful in the moments (a satisfying keycap press, a hand-written accent, a colored token pill), quiet on the pages.

This system explicitly rejects three things, drawn from the product's anti-references. It is **not** a fear-driven AI-safety interface — no red-warning-everywhere, no "zero hallucination" theater; guidance points to the next action, never scolds. It is **not** generic AI SaaS — no sparkle icons, no hero-metric templates, no gradient-purple "AI product" chrome, no endless identical feature-card grids. And it is **not** strict-academic or institutional — no seals, shields, crests, or journal-portal severity. Serious research capability, delivered without severity.

**Key Characteristics:**
- Warm-paper canvas with charcoal ink; accents earn their color, never decorate.
- Editorial serif headings (Instrument Serif) over a workhorse sans (Inter).
- Flat surfaces, tactile controls: cards are quiet; buttons are physical keycaps.
- A soft-candy accent set (mint, lavender, coral, lemon) reserved for state and tokens.
- Dark mode is a first-class theme, and reduced-motion is honored everywhere.

## 2. Colors: Warm Paper & Ink

A cream-manuscript base and charcoal ink, with a small set of soft-candy accents reserved for state, tokens, and evidence — never for decoration.

### Primary
- **Ink Charcoal** (`oklch(0.3012 0 0)`, light / `oklch(0.852 0.0205 100.6)` on dark): The solid-action color — the face of primary keycap buttons and the current-selection ink. Neutral (chroma 0) on purpose, so the accents stay the only chromatic voices.

### Secondary
- **Warm Tan** (`oklch(0.8647 0.0201 87.5)`): The second neutral layer — secondary keycap buttons, chip fills, quiet toolbars — a shade warmer than the content surface.

### Tertiary — The Accent Set
Each accent carries three tuned tints via `color-mix`: a solid (`--mint`), a `-foreground` for text on paper, a `-soft` pill fill, and a `-soft-border`.
- **Mint** (`oklch(0.6863 0.1743 154)`): Positive / "linked" / `@mention` tokens in the composer.
- **Lavender** (`oklch(0.57 0.12 305)`): Slash-command `/` tokens; secondary emphasis.
- **Coral** (`oklch(0.6863 0.1743 34.3)`): Warm highlight; the terracotta chart-1.
- **Lemon** (`oklch(0.7057 0.025 82.1)`): Low-chroma warm marker for soft emphasis.
- **Sky** (derived from chart-4): A soft warm-neutral tint for calm informational surfaces.

### Neutral
- **Warm Paper** (`oklch(0.9195 0.0169 88)`): The body canvas. The whole product sits on this cream.
- **Raised Paper** (`oklch(0.953 0.0156 86.4)`): Cards, popovers, the composer — one step lighter than the body.
- **Ink** (`oklch(0.235 0 0)`): Body text. Near-black, chroma 0.
- **Ink Soft / Taupe** (`oklch(0.4688 0.0136 84.6)`): Muted text and secondary labels — held to ≥4.5:1 on paper, never lighter for "elegance".
- **Line** (`oklch(0.8434 0.0231 87.2)`): Borders, inputs, dividers, and the card hairline ring.
- **Destructive** (`oklch(0.5771 0.2152 27.3)`): Errors and destructive actions only — rendered as a 10% tint fill, not a solid red slab.

### Evidence Stance (fixed, do not alter piecemeal)
The `/deep` stance meter is a CVD-validated four-color scale, hard-coded as hex and paired with a written label + number in every component: **yes** `#22a87e`, **possibly** `#d9a514`, **mixed** `#bd86ff`, **no** `#c43f3f`.

### Named Rules
**The Ink-Carries-Weight Rule.** The primary/solid color is neutral charcoal, not a brand hue. Chromatic accents (mint, lavender, coral, lemon) appear only on state, tokens, and data. If an accent is decorating rather than signaling, remove it.

**The Whole-Palette Rule.** The stance-meter hex values and the accent `-soft` tints are validated as a set. Never swap one color in isolation; re-validate the whole ramp.

## 3. Typography

**Display Font:** Instrument Serif (with `ui-serif, Georgia, serif`)
**Body / UI Font:** Inter (with `ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** JetBrains Mono (with `ui-monospace, SFMono-Regular, monospace`)
**Accent Font:** Caveat (hand) — used sparingly, like a pencil note

**Character:** A contrast pairing, not a lookalike pair: an editorial serif for headings against a neutral humanist sans for everything that does work. The serif gives calm confidence; Inter keeps labels, data, and dense UI legible. Caveat is the rare human aside. Base letter-spacing is a deliberate `+0.01em` across the interface.

### Hierarchy
- **Display** (Instrument Serif, 400, `clamp(2rem, 5vw, 4rem)`, line-height 1.1): Hero and marketing headlines. Clamp max stays ≤ 4rem — the page designs, it doesn't shout.
- **Headline** (Instrument Serif, 800, 1.55–2rem, line-height 1.2): In-app section and prose headings (`.aqsha-prose h1/h2`).
- **Title** (Inter, 600, ~0.94rem, line-height 1.4): Card titles, panel headers, dense UI headings.
- **Body** (Inter, 400, 1rem, line-height 1.72): Reading prose. Capped at 65–75ch for long-form.
- **Label** (Inter, 500, 0.75–0.875rem): Buttons, chips, form labels, metadata.
- **Mono** (JetBrains Mono, 0.8125rem): Code, tokens, technical values; `tabular-nums` for aligned figures.
- **Hand** (Caveat): Decorative annotations only — never for information a user must read to proceed.

### Named Rules
**The Sentence-Case Rule.** UI copy is sentence case. No all-caps labels, no tiny uppercase tracked eyebrows above sections. Emphasis comes from weight and size, not letterforms.

**The Serif-for-Voice, Sans-for-Work Rule.** Headings and moments of voice use Instrument Serif; anything a user reads to complete a task uses Inter. Never set a button, input, table cell, or data label in the serif or the hand.

## 4. Elevation

**Flat surfaces, tactile controls.** Surfaces are flat by default: cards, popovers, and panels sit on the paper with a `ring-1` hairline (`foreground/10`) and, at most, a soft ambient shadow — depth is a whisper, not a lift. The one place depth is real is the **keycap button**, which is physically dimensional: a gradient face, a lit top edge, a 3px colored lip beneath, and an ambient cast. Pressing it collapses the lip and sinks the cap 3px onto the surface. Depth, in this system, means "you can press this," not "this floats."

### Shadow Vocabulary
- **Card ambient** (`box-shadow: var(--shadow-soft-card)` ≈ `0 4px 10px rgba(0,0,0,0.1)`, `.shadow-aqsha`): The soft cast under raised paper. Pairs with the hairline ring; never used alone as a hard border.
- **Keycap rest** (`0 3px 0 lip, 0 5px 9px -3px ambient, inset 0 1px 0 highlight`): The signature control depth. Dark mode deepens shadows to `0.3` opacity / 15px blur.
- **Hairline ring** (`ring-1 ring-foreground/10`): The default surface edge — carries containment without a heavy border.

### Named Rules
**The Keycap-Only Rule.** Physical, multi-layer depth is reserved for interactive keycap buttons. Surfaces (cards, panels, sheets) stay flat with a hairline ring. Never give a static card a keycap shadow, and never flatten a keycap button into a plain fill.

## 5. Components

### Buttons
- **Shape:** Gently rounded (`rounded-lg`, 8px); default height `h-8` (32px), sizes xs/sm/lg + icon variants.
- **Primary / Secondary:** Solid keycap. `default` uses the charcoal primary face, `secondary` the warm-tan face — both carry the gradient face, lit edge, lip, and press choreography (`--btn-face` drives the color).
- **Outline / Ghost / Destructive:** Flat, non-keycap. Outline is a bordered paper button; ghost is transparent → `hover:bg-muted`; destructive is a `destructive/10` tint (never a solid red slab). These get a small `active:translate-y-px` nudge, not the keycap press.
- **Hover / Focus:** Keycaps rise 1px on hover and deepen their cast. Focus is `border-ring` + a 3px `ring-ring/50` halo. Open dropdown triggers (`aria-expanded`) render pressed.
- **Disabled:** Opacity 50%, press choreography removed.

### Chips / Tokens
- **Style:** Full-pill (`rounded-4xl`), `h-5` (20px), `text-xs`, `font-medium`. Composer tokens use the accent `-soft` fills with `-soft-border`: **mint** for `@mention`, **lavender** for `/command`.
- **Variants:** default (primary), secondary, outline, ghost, destructive (tint) — filter/action states via fill and border, never a colored side-stripe.

### Cards / Containers
- **Corner Style:** `rounded-xl` (12px).
- **Background:** Raised Paper (`--card`), one step lighter than the body.
- **Elevation Strategy:** `ring-1 ring-foreground/10` hairline + optional soft ambient shadow (see Elevation). Flat by default.
- **Internal Padding:** `--card-spacing` = 16px (`sm` = 12px); images bleed to the rounded top/bottom edges.
- **Nesting:** Never nest a card inside a card. Use tonal grouping or dividers instead.

### Inputs / Fields
- **Style:** `h-8` (32px), `rounded-lg`, `border-input` hairline, transparent fill (dark: `input/30`), `px-2.5 py-1`.
- **Placeholder:** `text-muted-foreground` — held to the same ≥4.5:1 contrast as body text, never a faint gray.
- **Focus:** `border-ring` + 3px `ring-ring/50` halo.
- **Error / Disabled:** `aria-invalid` → destructive border + ring; disabled → `input/50`, `opacity-50`, `cursor-not-allowed`.

### Navigation
- **Sidebar:** A slightly darker warm surface (`--sidebar`) than content; item labels in Inter, active item carried by `sidebar-primary` ink and fill. Active state uses a constant font-weight and a `border-transparent` on both states so nothing shifts on selection.
- **Mobile:** Sidebar collapses to a sheet/drawer (Vaul); structure is responsive, type is not fluid.

### Signature Component — The Keycap Button
The defining control of the system: a solid button rendered as a physical keycap via `.btn-keycap` in `globals.css`. A vertical gradient face, an inset top highlight, a 3px colored lip below (`--btn-face` mixed 60% toward black), and a soft ambient cast. Hover lifts 1px and deepens the lip; `:active` / open collapses the lip and drops the cap `translateY(3px)` so it bottoms onto the surface. Gradients don't interpolate, so motion rides `box-shadow` + `transform` (120–150ms) while the face swaps instantly. This is where the product's playfulness lives.

## 6. Do's and Don'ts

### Do:
- **Do** keep depth on controls, not surfaces — keycap for solid buttons, `ring-1 ring-foreground/10` hairline for cards and panels.
- **Do** reserve the accent set (mint, lavender, coral, lemon) for state, tokens, and data. Mint = `@mention`, lavender = `/command`.
- **Do** set headings in Instrument Serif and everything a user reads-to-act in Inter; Caveat only as a decorative aside.
- **Do** hold body, placeholder, and muted text to ≥4.5:1 on the warm paper — bump toward ink before lightening for "elegance".
- **Do** write UI copy in sentence case, and phrase guidance as the next action ("Add a stronger source before using this"), never a scold.
- **Do** use `tabular-nums` for figures, and give every animation a `prefers-reduced-motion` fallback (the crossfade/instant paths already exist).
- **Do** treat dark mode as a first-class theme; verify contrast and the keycap depth in both.

### Don't:
- **Don't** ship a fear-driven AI-safety tone — no "zero hallucination", no red warnings scattered everywhere, no punitive citation policing. Soft states before severe.
- **Don't** drift into generic AI SaaS — no sparkle icons, hero-metric templates, gradient-purple "AI product" chrome, or endless identical feature-card grids.
- **Don't** go strict-academic / institutional — no seals, shields, crests, or journal-portal severity. Serious ≠ severe.
- **Don't** use a colored `border-left`/`border-right` > 1px as an accent stripe on cards, list items, or callouts. Use full borders, tinted fills, or a leading token.
- **Don't** use gradient text (`background-clip: text`), decorative glassmorphism, or the tiny uppercase tracked eyebrow above sections.
- **Don't** nest cards, set a button/input in the serif or hand font, or give a static surface a keycap shadow.
- **Don't** alter the stance-meter hex values or an accent `-soft` tint in isolation — the palette is validated as a set.
