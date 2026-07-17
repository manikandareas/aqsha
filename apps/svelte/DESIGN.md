---
name: Aqsha
description: A calm, warm-paper research-and-writing workspace with tactile, keycap-deep controls.
colors:
  paper-bg: 'oklch(0.953 0.0156 86.4257)'
  paper-rail: 'oklch(0.9195 0.0169 88.003)'
  ink: 'oklch(0.235 0 0)'
  ink-soft: 'oklch(0.4688 0.0136 84.5932)'
  primary: 'oklch(0.55 0.14 160)'
  primary-foreground: 'oklch(0.97 0.02 160)'
  pine-secondary: 'oklch(0.35 0.06 165)'
  secondary-foreground: 'oklch(0.94 0.03 160)'
  muted: 'oklch(0.834 0.0232 87.163)'
  line: 'oklch(0.8434 0.0231 87.1621)'
  ring-mint: 'oklch(0.52 0.15 154)'
  destructive: 'oklch(0.5771 0.2152 27.325)'
  mint: 'oklch(0.6863 0.1743 154)'
  lavender: 'oklch(0.57 0.12 305)'
  coral: 'oklch(0.6863 0.1743 34.2614)'
  lemon: 'oklch(0.75 0.09 90)'
  band: 'oklch(0.24 0.012 70)'
  band-ink: 'oklch(0.95 0.014 88)'
typography:
  display:
    fontFamily: 'Nunito Sans, ui-rounded, ui-sans-serif, system-ui, sans-serif'
    fontSize: 'clamp(2rem, 5vw, 4rem)'
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: '0'
  headline:
    fontFamily: 'Nunito Sans, ui-rounded, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1.55rem'
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: '0'
  title:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.9375rem'
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: '0.01em'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.72
    letterSpacing: '0.01em'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.82rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: '0.01em'
  micro:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: '0.68rem'
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: '0.06em'
  mono:
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, monospace'
    fontSize: '0.8125rem'
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: '0'
  hand:
    fontFamily: 'Caveat, ui-serif, cursive'
    fontSize: '1.25rem'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: '0'
rounded:
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-secondary:
    backgroundColor: '{colors.pine-secondary}'
    textColor: '{colors.secondary-foreground}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-outline:
    backgroundColor: '{colors.paper-bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 16px'
    height: '40px'
  button-sm:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.sm}'
    padding: '0 12px'
    height: '32px'
  button-lg:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    rounded: '{rounded.md}'
    padding: '0 24px'
    height: '46px'
  card:
    backgroundColor: '{colors.paper-bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.lg}'
    padding: '16px'
  input:
    backgroundColor: '{colors.paper-bg}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '0 13px'
    height: '40px'
  chip-solid:
    backgroundColor: 'color-mix(in oklch, {colors.mint} 74%, black)'
    textColor: '#ffffff'
    rounded: '{rounded.full}'
    padding: '0 11px'
    height: '24px'
  badge-quiet:
    backgroundColor: '{colors.paper-bg}'
    textColor: '{colors.ink-soft}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
    height: '20px'
---

# Design System: Aqsha

## 1. Overview

**Creative North Star: "The Calm Study Desk"**

Aqsha looks like a tidy, warm desk where a student researcher can see everything in reach and nothing is shouting. The base is warm paper — a cream body (`oklch(0.953 0.0156 86.4257)`) with flat paper cards distinguished only by a 2px border — carrying charcoal ink text and a small family of soft-candy accents. What changed in v2 is the physicality: every surface and control now wears a confident **2px border**, and depth is a hard, playful "lip" — buttons are keycaps you can press, and even floating surfaces (menus, popovers, dialogs) rest on a solid lip instead of hovering on blur. It reads as a place to think and write, built from sturdy paper pieces. Nunito Sans sets the headings; Inter does the honest work of UI and body; Caveat shows up like a pencil annotation. The personality is **calm, clear, playful** — playful in the tactility, quiet on the pages.

This system explicitly rejects three things, drawn from the product's anti-references. It is **not** a fear-driven AI-safety interface — no red-warning-everywhere, no "zero hallucination" theater; guidance points to the next action, never scolds. It is **not** generic AI SaaS — no sparkle icons, no hero-metric templates, no gradient-purple "AI product" chrome, no endless identical feature-card grids. And it is **not** strict-academic or institutional — no seals, shields, crests, or journal-portal severity. Serious research capability, delivered without severity.

**Key Characteristics:**

- Warm-paper canvas with charcoal ink; accents earn their color, never decorate.
- 2px borders on every surface and control; 1px only for internal hairlines (table rows, menu separators).
- Tactile depth everywhere it means something: keycap buttons, lipped menus and dialogs, pressable controls.
- Focus is **mint** — the state color — never the ink.
- **No gradients.** Faces are flat; depth rides borders and lips. Static cards are flat (Duolingo-style): a confident 2px border and generous radius, no drop shadow.
- Dark mode is a first-class theme, and reduced-motion is honored everywhere.

## 2. Colors: Warm Paper & Ink

A cream-manuscript base and charcoal ink, with two solid greens carrying action (emerald primary, deep-pine secondary) and a small set of soft-candy accents reserved for state, tokens, and evidence — never for decoration.

### Primary

- **Emerald** (`oklch(0.55 0.14 160)`, light / `oklch(0.72 0.13 160)` on dark): The solid-action color — the face of primary keycap buttons and the mark of an **exclusive choice** (active tab, selected radio, current page). A deeper, quieter green than the bright mint state color, so the two never read as the same signal.

### Secondary

- **Deep Pine** (`oklch(0.35 0.06 165)` light / `oklch(0.42 0.06 165)` dark): The second solid — secondary keycap buttons, chip fills, quiet toolbars — a dark, low-chroma green. Hierarchy against the emerald primary comes from light-versus-dark, not from a different hue.

### Tertiary — The Accent Set

Each accent carries four tuned tints via `color-mix`: a solid (`--mint`), a `-foreground` for text on paper, a `-soft` pill/hover fill with `-soft-border`, and a **`-strong`** (mixed 74–82% toward black) — the solid chip face that carries white text in both modes.

- **Mint** (`oklch(0.6863 0.1743 154)`): The **state color** — on/off controls (checkbox, switch, solo toggle), focus ring, "linked"/positive, `@mention` tokens, menu hover.
- **Lavender** (`oklch(0.57 0.12 305)`): Slash-command `/` tokens (mono chip); secondary emphasis.
- **Coral** (`oklch(0.6863 0.1743 34.3)`): Warm highlight — progress fills, slider ranges, carousel dots; the terracotta chart-1.
- **Lemon** (`oklch(0.75 0.09 90)`): Warm marker for soft emphasis and caution-flavored alerts. Its chip rides a light face (`lemon 65% + white`) with a dedicated dark ink (`--lemon-chip-ink`).
- **Sky** (derived from chart-4): A soft warm-neutral tint for calm informational surfaces.

### Neutral

- **Warm Paper** (`oklch(0.9195 0.0169 88)`): The body canvas.
- **Raised Paper** (`oklch(0.953 0.0156 86.4)`): Cards, popovers, inputs, the composer — one step lighter than the body.
- **Ink** (`oklch(0.235 0 0)`): Body text. Near-black, chroma 0.
- **Ink Soft / Taupe** (`oklch(0.4688 0.0136 84.6)`): Muted text and secondary labels — held to ≥4.5:1 on paper.
- **Line** (`oklch(0.8434 0.0231 87.2)`): The 2px border color for every surface and control, and the lip color of floating surfaces.
- **Band** (`oklch(0.24 0.012 70)` / ink `oklch(0.95 0.014 88)`): The dark footer band — a near-black warm panel whose links read in band-ink.
- **Destructive** (`oklch(0.5771 0.2152 27.3)`): Errors and destructive actions — as a `-soft` tint fill for the quiet variant, `-strong` keycap for the irreversible one.

### Focus

- **Mint Ring** (`--ring`, `oklch(0.52 0.15 154)` light / `oklch(0.72 0.14 154)` dark): Focus-visible borders and halos are mint everywhere. Focus is a state, and mint is the state color — the emerald primary stays reserved for choices. In light mode `--ring` is intentionally darker than `--mint` so the focus halo holds ≥3:1 against both the page and the sidebar rail.

### Evidence Stance (fixed, do not alter piecemeal)

The `/deep` stance meter is a CVD-validated four-color scale, hard-coded as hex and paired with a written label + number in every component: **yes** `#22a87e`, **possibly** `#d9a514`, **mixed** `#bd86ff`, **no** `#c43f3f`.

### Named Rules

**The Mint-State, Primary-Choice Rule.** Mint marks **binary state** — a checkbox checked, a switch on, a solo toggle engaged, a field focused. Primary (emerald) marks an **exclusive choice** — the selected radio, the active tab, the current page, the picked segment. Never swap them: a mint radio or an emerald-solid switch reads as the wrong grammar.

**The Primary-Carries-Weight Rule.** Only the emerald/pine solids may fill a control's face; body text stays neutral charcoal ink. The candy accents appear only on state, tokens, and data — if an accent is decorating rather than signaling, remove it.

**The Whole-Palette Rule.** The stance-meter hex values and the accent tints are validated as a set. Never swap one color in isolation; re-validate the whole ramp.

## 3. Typography

**Display Font:** Nunito Sans (with `ui-rounded, ui-sans-serif, system-ui, sans-serif`)
**Body / UI Font:** Inter (with `ui-sans-serif, system-ui, sans-serif`)
**Mono Font:** JetBrains Mono (with `ui-monospace, SFMono-Regular, monospace`)
**Accent Font:** Caveat (hand) — used sparingly, like a pencil note

**Character:** A contrast pairing, not a lookalike pair: a friendly rounded display sans for headings against a neutral humanist sans for everything that does work. Base letter-spacing is a deliberate `+0.01em` across the interface. UI type walks a fixed staircase: **0.68 / 0.75 / 0.82 / 0.9 / 1rem** — micro-labels, small labels, control text, field/button text, body. In code, use the named utilities `text-micro`, `text-label`, `text-control`, and `text-field` (defined in `@aqsha/ui-svelte` tokens) instead of arbitrary rem values.

### Hierarchy

- **Display** (Nunito Sans, 500, `clamp(2rem, 5vw, 4rem)`, line-height 1.1): Hero and marketing headlines.
- **Headline** (Nunito Sans, 700, 1.55–2rem, line-height 1.2): In-app section and prose headings.
- **Title** (Inter, 600, ~0.94rem, line-height 1.4): Card titles, panel headers, dense UI headings.
- **Body** (Inter, 400, 1rem, line-height 1.72): Reading prose. Capped at 65–75ch for long-form.
- **Control** (Inter, 500–700, 0.82–0.9rem): Buttons (700), fields (500), menu items, tabs.
- **Micro** (Inter, 800, 0.68rem, tracking +0.06em): Table headers and calendar weekday labels — the one sanctioned uppercase voice.
- **Mono** (JetBrains Mono, 0.8125rem): Code, tokens, kbd, OTP cells; `tabular-nums` for aligned figures.
- **Hand** (Caveat): Decorative annotations only — never for information a user must read to proceed.

### Named Rules

**The Sentence-Case Rule.** UI copy is sentence case. No all-caps labels and no uppercase eyebrows above sections. The two scoped exceptions are structural micro-labels (table `th`, calendar weekday cells) and solid chip text — both are grammar, not copy.

**The Display-for-Voice, Sans-for-Work Rule.** Headings and moments of voice use Nunito Sans; anything a user reads to complete a task uses Inter. Never set a button, input, table cell, or data label in the display face or the hand.

## 4. Elevation

**Everything sits on a lip.** Depth in this system is a hard, offset, solid shadow — a physical edge, never a blur-only float and never a gradient. Buttons are keycaps; floating surfaces rest on a 3–4px lip in the border color; small controls carry a 2px static lip. Static cards carry no shadow at all — they sit flat on the paper behind their 2px border. The soft ambient shadow (`--shadow-soft-card`) is reserved for surfaces that float (it rides inside `.lip-pop`/`.lip-modal`), never for resting cards.

### Shadow Vocabulary

- **Keycap rest** (`0 4px 0 0 color-mix(face 62%, black 38%)`): Solid buttons. Hover brightens the face (`brightness(1.08)`); press/open sinks the cap `translateY(4px)` and the lip collapses to zero — it bottoms out on the surface.
- **Flat lip** (`0 3px 0 0 var(--border)` + `active: translateY(3px)`): Outline buttons and soft-destructive buttons. Same physics, quieter voice.
- **Pop lip** (`.lip-pop` = `0 3px 0 0 var(--border)` + soft card shadow): Menus, popovers, hover cards, tooltips, alerts, toasts.
- **Modal lip** (`.lip-modal` = `0 4px 0 0 var(--border)` + `0 20px 50px rgba(0,0,0,0.18)`): Dialogs and the command menu.
- **Static lip** (`.lip-static` = `0 2px 0 0 var(--lip-color)`): Non-pressing controls that still have body — checkbox boxes, radio rings, kbd, calendar nav, the active pagination square.
- **Control inset** (`inset 0 2px 0 0 color-mix(border 45%)`): The subtle top shadow inside inputs, selects, and OTP cells — the field is a shallow tray.
- **Flat card** (no shadow): Static cards, panels, banners, and the composer rest flat — 2px border only. `--shadow-soft-card` appears solely inside the pop/modal lips of floating surfaces.

### Named Rules

**The Two-Pixel Rule.** Every surface (card, panel, menu, dialog, sheet) and every control (button, field, chip-outline, checkbox) wears a 2px border. 1px is reserved for internal hairlines: table row separators, menu separators, avatar rings.

**The Solid-Depth Rule.** Depth is always a solid offset lip, never a blur-only elevation and never a gradient face. If a surface floats, it floats on a lip; if a control presses, the lip collapses. Static surfaces never get the keycap's press choreography.

## 5. Components

### Buttons

- **Shape:** `rounded-md` (12px; `sm` uses 8px); heights **sm 32 / default 40 / lg 46** — default aligns with inputs. Text is Inter 700 at 0.82–1rem.
- **Primary / Secondary / Destructive-solid:** Flat-faced keycaps (`--btn-face` drives the color: emerald, deep pine, or `destructive-strong`) with the 4px lip and bottom-out press.
- **Outline:** 2px `border-border`, paper face, 3px flat lip, `hover:bg-muted`.
- **Ghost:** Muted text → foreground on hover; a bare 2px active nudge, no depth classes.
- **Destructive (quiet):** `destructive-soft` fill, destructive text, 35% destructive border, 3px lip mixed toward the card. The solid keycap version is for the truly irreversible.
- **Hover / Focus:** Keycaps brighten 8%; focus is a mint `border-ring` + 3px `ring-ring/50` halo. Open dropdown triggers (`aria-expanded`) render pressed.
- **Disabled:** Muted fill, muted text, 50% opacity, all depth removed.

### Chips & Badges

Two families share one primitive:

- **Quiet badges** (`h-5`, sentence case, `font-medium`): metadata — default/secondary/ghost tints; outline carries the 2px border on a card face. **`eyebrow`** is a quiet outline section label (sentence case, semibold) for design-lab / marketing markers.
- **Solid chips** (`h-6`, `font-extrabold`, uppercase, +0.04em, white text): loud state tokens on the `-strong` faces. `chip-mint` = done/linked, `chip-lavender` = `/command` (JetBrains Mono, no uppercase), `chip-coral` = new/highlight, `chip-lemon` = draft (light lemon face + `--lemon-chip-ink`).

### Cards / Containers

- **Corner Style:** `rounded-lg` (16px).
- **Background:** Raised Paper (`--card`) with a **2px `border-border`**; no shadow — cards are flat.
- **Internal Padding:** `--card-spacing` = 16px (`sm` = 12px); images bleed to 14px-rounded top/bottom edges (16 − 2px border).
- **Nesting:** Never nest a card inside a card. Use tonal grouping or 1px hairline dividers instead.

### Inputs / Fields

- **Style:** `h-10` (40px), `rounded-md`, **2px `border-input`**, raised-paper fill, control inset, Inter 500 at 0.9rem.
- **Placeholder:** `text-muted-foreground` at the same weight — held to ≥4.5:1.
- **Focus:** Mint `border-ring` + 3px `ring-ring/50` halo.
- **Error / Disabled:** `aria-invalid` → destructive border + ring; disabled → muted fill, muted text.
- **OTP:** Separate 46×56 mono cells (1.35rem), same tray language; the caret is mint.

### Selection Controls

- **Checkbox:** 24px, `rounded-sm`, 2px border + 2px static lip; checked = **mint-strong** fill with a white check.
- **Switch:** 44×26 pill; on = **mint-strong** track, 20px raised-paper thumb slides right.
- **Radio:** 24px circle, 2px border + static lip; selected = **primary** — primary border, lip, and a 10px primary dot.
- **Toggle (solo):** on = mint-strong. **Toggle group / Tabs:** pills inside a 2px-bordered 12px frame with 5px padding; the active pill is **primary** (primary fill, primary-foreground text).
- **Slider:** 12px muted track, coral range, 24px thumb — paper face, 2px primary border, 3px primary lip that compresses on drag.
- **Progress:** Same 12px track; coral fill.

### Menus & Overlays

- **Menu / Select list / Popover / Hover card / Tooltip:** Raised paper, 2px border, `rounded-md` (popover/hover-card `lg`), **pop lip**. Items: `rounded-sm`, 0.82rem, hover = `mint-soft`; selected item = bold + mint check. Tooltips are paper with foreground text (no inverted slab, no arrow).
- **Dialog:** max-w 440, `rounded-lg`, **modal lip**; scrim `black/35` + `blur(3px)`.
- **Command menu:** Same modal grammar; groups labeled in the micro voice.
- **Sheet:** 360px side panel with a 2px edge border. **Drawer:** bottom sheet, 16px top radius, 44×5 grip in the border color.
- **Toast:** The alert family fixed to the corner — hue-mixed fill/border + 3px lip (mint = success, lemon = warning, destructive = error).

### Data

- **Table:** Card-faced wrapper with 2px border and `rounded-lg`; `th` in the micro voice on a muted-tinted header row above a 2px rule; body rows separated by 1px hairlines; hover = muted tint, selected row = `mint-soft`.
- **Pagination:** 34px squares, 2px border; the current page is a primary (emerald) square with a 2px lip (exclusive choice).
- **Calendar:** Framed card (2px border, `rounded-lg`); weekday cells in the micro voice; today = 2px border; the selected day = **mint-strong** with a 2px lip.

### Navigation

- **Sidebar:** A slightly darker warm surface (`--sidebar`) than content; active item carried by `sidebar-primary` (emerald) text and fill at constant font-weight so nothing shifts on selection.
- **Footer band:** The `band` surface — dark warm panel, `rounded-lg`, band-ink links at 70% that resolve to full on hover.
- **Mobile:** Sidebar collapses to a sheet/drawer; structure is responsive, type is not fluid.

### Signature Component — The Keycap Button

The defining control of the system: a solid button rendered as a physical keycap via `.btn-keycap`. A **flat** color face (`--btn-face`), a 4px solid lip beneath (face mixed 62% toward 38% black), no gradient, no highlight. Hover brightens the face 8%; `:active` / open collapses the lip and drops the cap `translateY(4px)` so it bottoms onto the surface. Motion rides `box-shadow` + `transform` (~100ms) while the face color swaps instantly. In v2 this physics extends outward: outline buttons press on a 3px border lip, menus and dialogs _rest_ on the same kind of lip without the press. This is where the product's playfulness lives.

## 6. Do's and Don'ts

### Do:

- **Do** give every surface and control a 2px border, and reserve 1px for internal hairlines (table rows, menu separators, avatar rings).
- **Do** put depth on everything that floats or presses — keycap lips on solid buttons, pop/modal lips on menus and dialogs, static lips on checkboxes and kbd.
- **Do** follow the state grammar: mint for on/off and focus, ink for exclusive choice. Mint = `@mention`, lavender = `/command`.
- **Do** set headings in Nunito Sans and everything a user reads-to-act in Inter; Caveat only as a decorative aside.
- **Do** hold body, placeholder, and muted text to ≥4.5:1 on the warm paper; solid chips carry white text only on the `-strong` faces.
- **Do** write UI copy in sentence case, use `tabular-nums` for figures, and give every animation a `prefers-reduced-motion` fallback.
- **Do** treat dark mode as a first-class theme; verify contrast, lips, and chip faces in both.

### Don't:

- **Don't** use gradients — not on button faces, not on text, not on surfaces. Faces are flat; depth is a lip.
- **Don't** ship a fear-driven AI-safety tone — no "zero hallucination", no red warnings scattered everywhere. Soft destructive tint first; the solid red keycap only for the irreversible.
- **Don't** drift into generic AI SaaS — no sparkle icons, hero-metric templates, or endless identical feature-card grids — or into institutional severity.
- **Don't** use a colored `border-left`/`border-right` > 1px as an accent stripe. Alerts speak through hue-mixed fill + border + lip, never a side-stripe.
- **Don't** float a surface on blur alone, give a static card the keycap press, or nest cards.
- **Don't** mark an exclusive choice in mint or a binary state in ink — the grammar is load-bearing.
- **Don't** alter the stance-meter hex values or an accent tint in isolation — the palette is validated as a set.
