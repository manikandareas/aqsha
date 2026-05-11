# Aqsha App Design System

This document is the visual and interaction source of truth for `apps/app` — the authenticated Convex-backed research chatbot. It adapts the Aqsha brand for a chat-first, citation-aware, durable-execution product.

Companion artifacts:

- `docs/aqsha-convex-research-chatbot-prd.md` — product scope and behavior.
- `docs/aqsha-prototype.html` — working HTML preview of every screen state. Tokens here mirror it.
- Previous writing-workspace design language has been retired. Do not import journal-era language into `apps/app`.

## 1. Visual Theme & Atmosphere

Aqsha's chat app should feel like a **calm research companion on warm paper**: focused, honest about its work, friendly without being cute. The user comes here to ask, read sources, and walk away with something they can trust.

The core metaphor is:

> A quiet reading desk where sources, notes, and answers stay connected.

The interface uses a warm off-white canvas, ink-charcoal text, raised paper surfaces, and a small set of accents with fixed roles: sky for primary and Normal, mint for linked/source/completed, lemon for note/partial, coral for attention/retry, lavender for Deep/review. Dark mode is a charcoal-warm workspace, not a blue-black dashboard or an AI-purple gradient.

The interface should feel:

- Airy and readable for long reading sessions.
- Rounded but disciplined.
- Honest: progress, sources, and limits are visible instead of hidden behind magic.
- Calm under long-running work: Deep runs should feel like the app is thinking, not crashing.
- Premium through spacing and restraint, not ornament.

Avoid:

- Dashboard panels full of status chips.
- Visible workflow internals (`queued`, `retrying`, `waiting` labels).
- Chat bubbles with speech-app styling (asymmetric tails, colored fills per speaker).
- AI-purple gradients or sparkle effects.
- Journal-era language ("Add to Journal", "Saved to Journal", "Shared Journal").
- Nested cards; dense toolbars above the composer.
- Dark mode as pure `#000` or navy.

## 2. Color Palette & Roles

Tokens are the exact values used in `docs/aqsha-prototype.html`. Keep them in sync when migrating to Tailwind theme / CSS variables.

### Core Neutrals (light)

- **Paper Bg** `#fff7f0` — page background, chat canvas.
- **Paper Raised** `#fffdf8` — sidebar, composer, cards, popovers.
- **Paper Mist** `#f4f1ea` — quiet surfaces, inactive tab fills, hero panels.
- **Paper Border** `#e5e7eb` — default borders, dividers.
- **Paper Input** `#d1d5db` — form-field borders.
- **Ink** `#1a1f2b` — primary text, headings, icon strokes.
- **Ink Soft** `#3f4756` — secondary body, subheadings.
- **Ink Muted** `#4b5563` — captions, meta, placeholder-adjacent labels.

### Core Neutrals (dark)

Dark mode = charcoal workspace. `html.dark` swaps these:

- **Charcoal** `#181818` — page background.
- **Dark Card** `#202020` — cards, composer, sidebar surfaces.
- **Dark Mist** `#242424` — hover, inactive tab fills, secondary surfaces.
- **Dark Border** `#2d2d2d` — separators.
- **Dark Input Border** `#3a3a3a` — form-field borders.
- **Warm Mist** `#f4f1ea` — primary text.
- **Dark Ink Soft** `#d4d4d4` — secondary body.
- **Dark Muted** `#a3a3a3` — captions, meta.
- **Dark Placeholder** `#737373` — placeholder text only.

### Accents (shared light + dark)

Accents have fixed product roles. Do not invent new ones.

| Token | Light | Active | Dark text | Dark tint | Role |
| --- | --- | --- | --- | --- | --- |
| Sky | `#4a90f7` | `#2f73d6` | `#8fb8ff` | `rgba(74,144,247,0.16)` | primary CTA, links, Normal mode, focus ring, active nav |
| Mint | `#2ecc9a` | `#22a87e` | `#6ee3bf` | `rgba(46,204,154,0.14)` | linked/source, verified, completed, citation marker |
| Lemon | `#ffd84d` | `#8a6d00` (text on light) | `#ffe082` | `rgba(255,216,77,0.14)` | note, partial support, review reminder |
| Coral | `#ff6b6b` | `#eb5353` | `#ff8e8e` | `rgba(255,107,107,0.14)` | attention, retry, destructive, insufficient evidence |
| Lavender | `#bd86ff` (light) / `#b0a6ff` (dark) | `#7a4fd1` (text on light) | `#b0a6ff` | `rgba(176,166,255,0.14)` | Deep mode, review, secondary category |

### Soft surfaces (per accent)

Used for chips, subtle fills, and "currently active" affordances. Each accent ships a `*-soft` background and border:

- `sky-soft` `#eaf4ff` / border `#cfe1fb`
- `mint-soft` `#e9f8f2` / border `#c6ebd9`
- `lemon-soft` `#fff6cc` / border `#f2d97a`
- `coral-soft` `#ffecec` / border `#f6c7c7`
- `lavender-soft` `#f1e8ff` / border `#dcc9f7`
- `ink-soft-chip` `#f1f3f5` / border `#e5e7eb`

In dark mode, soft surfaces become tinted glass: low-opacity fill + low-opacity border (see table above). Do not use solid saturated accents as fills in dark mode — they shout.

### Semantic Mapping

- **Primary** → Sky.
- **Primary foreground** → `#fffdf8` on light, `#181818` on dark where contrast demands it.
- **Success / Linked** → Mint.
- **Warning / Note** → Lemon.
- **Destructive / Attention** → Coral.
- **Deep mode / Review** → Lavender.
- **Focus ring** → Sky at 25% opacity (`rgba(74,144,247,0.25)`).

### Dark Mode Do/Don't

Do: use the dark neutral ramp (`#181818 → #202020 → #242424 → #2d2d2d`) for surfaces; use tinted-glass accents for chips; keep body text at `#f4f1ea`, not pure white.

Don't: use `#000` backgrounds; use solid saturated accent fills on large surfaces; darken Sky into navy; invert the palette mechanically.

## 3. Typography

### Font Families

- **Display / Headings**: Nunito (700–800). Brand moments, panel titles, hero copy.
- **UI / Body**: Inter (400–600). Chat messages, nav, metadata, forms.
- **Mono**: JetBrains Mono (400–500). DOIs, URLs, code, keyboard shortcuts, run/workflow ids.
- **Handwriting Accent**: Caveat. Reserved for small margin notes or empty-state winks. Use once per screen at most; never for functional text.

All fonts load from Google Fonts in the prototype. The Next.js app should use `next/font` with identical families and weights.

### Hierarchy (app-tuned)

Chat UI runs smaller than marketing. Use these for `apps/app`.

| Role | Size | Weight | Line Height | Use |
| --- | ---: | ---: | ---: | --- |
| Page Title (Nunito) | 28–32px | 700 | 1.2 | auth screens, empty states |
| Panel Title (Nunito) | 16–18px | 700 | 1.25 | panel headers, section dividers |
| Message body (Inter) | 15px | 400–500 | 1.6 | chat messages, reader copy |
| Message body reader (Inter) | 16px | 400 | 1.65 | artifact reader view |
| Nav / Button (Inter) | 13–14px | 500–650 | 1.33 | nav items, buttons |
| Caption / Meta (Inter) | 11–12px | 500 | 1.4 | thread meta, timestamps, counts |
| Badge / Chip (Inter) | 12px | 650 | 1.33 | chips, step labels |
| Mono (JetBrains Mono) | 11px | 400–500 | — | shortcuts, ids, DOIs |

### Principles

- Chat messages use Inter body, not the display face — keep long reading comfortable.
- Use Nunito for panel titles and brand moments only; never for dense lists.
- Prefer weight and color over size for hierarchy inside chat.
- Letter spacing stays at 0.
- Avoid all-caps; small caps look dated in this product.
- Monospace is a signal: a mono string means "technical metadata" (DOI, id, shortcut). Do not use it for poetic effect.

## 4. Component Styling

### Buttons

**Primary**

- Background Sky `#4a90f7`, text `#fffdf8`, hover Sky Active `#2f73d6`.
- Radius 8–10px; pill (9999px) only for the mode switch and chips.
- Padding 8–10px vertical, 14–18px horizontal.
- Active transform `scale(0.985)`.
- Focus ring: Sky at 25% opacity.

**Secondary**

- Background `#fffdf8` on light / `#202020` on dark, `1px solid` paper-border / dark-border.
- Text Ink.
- Hover tints slightly toward the nearest accent meaning; never gray-only.

**Ghost**

- Transparent background, Ink text, hover `#fff7f0` on light / `#242424` on dark.
- For sidebar nav, toolbar actions, and compact controls.

**Destructive / Attention**

- Coral background, white text, hover Coral Active.
- Used for Cancel run confirmations, delete corpus source, revoke access.

**Stop / Cancel (inline)**

- While a Deep run is active, the composer Send button is replaced by a **Stop** button: Coral outline, Coral text, ghost fill. Not a full destructive button — this is a pause, not a delete.

**Retry (inline bubble)**

- Used inside an assistant message when a Deep step failed. Coral-soft background, Coral-active text, small. One primary Retry action, one secondary dismiss.

### Composer (prompt input)

The composer is the most-used surface in the app. Design rules:

- Single raised card, radius 14px, `--shadow-soft-card`.
- Row 1: textarea (auto-grow), Inter 15px body, placeholder `#4b5563`.
- Row 2: left — mode switch + attachment/tool menu; right — Send (or Stop).
- The **Mode Switch** is a two-position pill (Normal / Deep):
  - Container: `#f4f1ea` bg, `1px solid #e5e7eb`, radius 9999px, 3px inner padding.
  - Active Normal: raised paper fill, Ink text.
  - Active Deep: raised paper fill, Lavender text (`#7a4fd1` light / `#b0a6ff` dark).
  - No third mode. "Research Answer" is emergent behavior of Normal, not a button.
- While a run is active, the composer disables the textarea and shows Stop; the mode switch is locked.
- Attachment/tool affordances live inside Normal mode only — Deep chooses tools itself.
- Keyboard: `⌘/Ctrl+Enter` sends; `Shift+Enter` newlines; `Esc` cancels an active run when focus is in composer.

### Chips & Badges

Chips are the visual backbone for "linked blocks". Keep them consistent.

- Radius 9999px, min-height 28px, padding 4px 10px.
- Inter 12px / 650.
- 1px border tinted toward the meaning.
- Fixed color roles (see §2). Do not invent per-screen colors.

Types used in `apps/app`:

- **Source chip** (mint) — a source that backs a claim.
- **Citation marker** — tiny inline `[n]` pill (mint) inside prose; 18px min width, links to the Sources tab.
- **Thread badge** (sky / lavender / coral) — indicates last mode used or state: "normal", "deep", "laporan".
- **Step chip** — appears inside inline step blocks (see Chat Progress).
- **Mode pill** — see Composer.
- **Evidence quality** (mint / lemon / coral) — "cukup", "perlu sumber lebih kuat", "tidak didukung".
- **Origin chip** (ink-soft) — "RAG", "Web", "Arxiv", "Upload", "Manual".

Never use more than 2 chip colors in a single visual cluster; chip soup is a sign the surface is doing too much.

### Cards & Panels

- Background Raised Paper on light, Dark Card on dark.
- Border `1px` paper-border / dark-border.
- Radius 14px standard, 18px for prominent panels (run header, artifact reader), 10px for compact inline blocks (step indicators, retry bubble).
- Shadow: `--shadow-soft-card` for standard, `--shadow-deep-card` for dialogs/popovers.
- Use for real objects: a message, a source, an artifact, a run, a dialog. Do not wrap whole page regions in decorative cards.
- No nested cards. If a card seems to need a card inside, switch the inner to a bordered row or a chip row.

### Inputs & Editable Surfaces

- Background raised paper / dark card.
- Border `1px` paper-input / dark-input-border.
- Focus ring Sky at 25% opacity, no heavy glow.
- Radius 8px for compact fields, 14px for composer.
- Labels above inputs; helper/error text below.
- Placeholder uses muted text at reduced contrast; never italic.

### Navigation (sidebar + thread list)

- Sidebar surface: raised paper / dark card.
- Thread rail item: row with title (Inter 14px/600), last-activity meta (11px), optional badge chip aligned right.
- Active thread: sky-soft fill, sky-active text, 3px sky left-bar.
- Hover: paper-bg / dark-mist wash.
- Nav labels short; use icon + text for primary entries; icon-only with tooltip only if the icon is unambiguous (search, new thread).

### Right Panel (Sources + Artifacts)

The right panel is **one panel with two tabs**, not two panels. See the PRD for the conditional-visibility rule.

- Container: raised paper / dark card; `1px` left border on light, no shadow (it lives inside the main layout).
- Tab bar: two `tab-btn`s with an `8px` bottom-border accent; active tab uses sky text + sky bottom-border + sky-soft count pill.
- Count pill: `tab-count` chip, Inter 11px/650.
- Tab panels scroll independently; the chat timeline does not share scroll with the panel.
- Opening an artifact replaces the chat main area with a reader view; a "Kembali ke chat" affordance returns.

### Chat message styling

- Speaker rows, not speech bubbles. Avatar + name + timestamp on a row, message body in the column below.
- User messages: body Ink, no fill.
- Assistant messages: body Ink, optional small header chip when the message contains inline research progress or citations.
- Streaming: `.stream-caret` blinking bar at the end of the currently-streaming assistant message. Sky on light, Sky-dark-text on dark.
- Markdown: supported. Prose uses `.prose-aqsha` — `p` line-height 1.6, `h2` display face.
- Citation markers inside prose are inline `[n]` mint pills; clicking scrolls the Sources tab to the source.

### Inline step blocks (Deep progress)

When a Deep run is active, the assistant's response area contains a vertical list of step blocks. Each block:

- Compact row, 10px radius, 1px border paper-border / dark-border.
- Left: step icon — Sky spinner for active, Mint check for done, Ink-muted dot for idle, Coral-soft square for error.
- Middle: step label (Inter 13px/600). Active step uses `.shimmer-text` (gradient ink-muted → ink → ink-muted, 1.6s loop).
- Optional right: chip with count (e.g. "6 sources", "3 excerpts"). Inter 11px/650.
- Expandable: clicking a done/active step can reveal sub-details (queries, retrieved sources, extraction summaries) without leaving the chat.

Step labels are user-facing natural language, not workflow step names:

| Internal step | UI label |
| --- | --- |
| `planResearch` | Merencanakan riset |
| `retrieveSources` | Mencari sumber |
| `readExtract` | Membaca dan mengutip |
| `synthesize` | Menyusun laporan |
| `verifyCitations` | Memeriksa kutipan |
| `persistArtifact` | Menyimpan hasil |
| `finalizeThread` | Menutup riset |

### Artifact reader

- Full-width reader that takes over the chat area, keeping the right panel visible if the user opened it from there.
- Title (Nunito 22–24px/700), subtitle meta row (artifact type chip + timestamp + run link).
- Body rendered as prose-aqsha.
- Footer actions: **Salin markdown**, **Bagikan link**, **Buka run**. There is no "Add to Journal".
- Source references inside the reader resolve to the Sources tab, not inline popovers.

### Source detail

- Modal-less panel inside the Sources tab; selecting a source expands its card in place.
- Fields: title (Nunito 16px/700), origin chip, author/year, URL/DOI in mono, retrieved-at timestamp.
- Extract/snippet in a quoted block with lemon-soft left border.
- Evidence-quality chip.
- Actions: **Buka sumber** (external), **Salin kutipan**. There is no "Add to Journal".

### Rate-limit / friction surfaces

- Use a calm card, not a red banner. Lemon-soft fill, lemon border, Ink text.
- Title starts with the positive framing: "Perlu istirahat sebentar".
- Body explains what was throttled and returns a retry-at time.
- One ghost action: "Coba lagi nanti". Do not offer a "bypass" option.

### Empty states

- Centered column, max width 520px.
- Small icon/illustration on raised paper; Nunito title (24–28px/700); Inter body (15px/500 ink-muted).
- One primary action, one secondary action. Never zero.

## 5. Layout Principles

### Frame

- Three columns on desktop: sidebar (thread list + nav, 260–300px) · main chat (fluid) · right panel (conditional, 360–420px).
- Sidebar collapses behind a drawer below `lg`.
- Right panel collapses behind a tab icon in the top bar below `lg`.
- Composer sticks to the bottom of the main column; max width 760px inside a max-width container (`max-w-3xl`-ish).
- Chat timeline max width matches composer. Long mono strings wrap; never force horizontal scroll on messages.

### Spacing System

8px base, with loose editorial rhythm.

- Micro: 2, 4, 6.
- Compact UI: 8, 10, 12.
- Component: 16, 20, 24.
- Section: 32, 48, 64.

Chat rows use 12–16px vertical rhythm between speakers; 20px between turns when the previous turn ended a thought.

### Border Radius Scale

- 6px — small controls (chip-internal icons, count pills).
- 8px — inputs, buttons.
- 10px — inline step blocks, compact cards.
- 14px — standard panels, composer.
- 18px — prominent panels (artifact reader, run header).
- 24px — hero/landing only.
- 9999px — pills, chips, mode switch.

### Whitespace Philosophy

- The composer's breathing room matters more than any right-panel detail. Keep the message area calm.
- Do not fill the sidebar with status lights; thread meta is one line max.
- Prefer grouping via proximity over cards.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | separator only | chat canvas, timeline |
| Line | `1px` paper-border / dark-border | dividers, panel edges |
| Soft Card | `--shadow-soft-card` | composer, thread rail, cards, step blocks |
| Deep Card | `--shadow-deep-card` | popovers, dialogs, artifact reader header |
| Focus | sky ring, 25% opacity | keyboard focus |

Shadows stay broad, low-contrast, ink-tinted. In dark mode, shadow opacity increases (`0.28 / 0.35 / 0.45`) because the background is darker and light-mode shadows disappear; see the prototype's `html.dark` overrides for exact values.

## 7. Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
| --- | --- | --- |
| Mobile | <640px | sidebar becomes drawer; right panel becomes full-screen overlay; composer fills width |
| Tablet | 640–1024px | sidebar behind drawer; right panel behind tab; chat fluid |
| Desktop | 1024–1440px | 3-column layout visible; right panel conditional |
| Large | >1440px | centered chat, panels keep max widths; avoid stretching reader line-length |

### Touch targets

- Buttons and icon buttons ≥ 40px tall on mobile; ≥ 32px on desktop.
- Chips ≥ 28px tall everywhere.
- Composer actions ≥ 44px on mobile — the thumb zone matters.

### Collapsing strategy

- Step blocks remain inline on mobile; they never collapse into a single summary chip.
- Right panel becomes a bottom sheet on mobile, not a second page.
- Artifact reader is full-screen on mobile.

## 8. Accessibility & States

### Focus

- Every interactive element has a visible focus ring (`soft-focus`: sky at 25% opacity).
- Skip links: sidebar → main → composer → right panel.
- Mode switch and Send/Stop must be reachable without leaving the composer context.

### Interactive states

- **Default**: paper surface, clear border.
- **Hover**: light tint; never strong glow.
- **Active**: `scale(0.985)` press.
- **Focus**: sky ring.
- **Disabled**: muted text + reduced opacity, still readable.
- **Loading**: skeletons for thread list and artifact reader; the composer uses the shimmer/Stop treatment instead of a spinner.
- **Empty**: one friendly action, one clear next step.
- **Error**: action-oriented language; never blame.

### Color contrast

- Ink on paper-bg and Warm Mist on Charcoal both meet WCAG AA for body text. Re-verify any custom surface before shipping.
- Lemon surfaces always use Ink text, never white.
- Coral should appear for meaningful attention only — avoid using it as a secondary highlight.

### Motion

- Streaming caret blink: 1s steps(1) infinite; respect `prefers-reduced-motion` → replace with a static sky dot.
- Shimmer on active steps: 1.6s linear infinite; also disabled under reduced motion (falls back to a sky dot + label).
- No parallax, no entrance animations longer than 200ms.

## 9. Product Language Rules

Use this terminology consistently in UI copy:

- **Chat** / **Research Thread** — the conversation.
- **Pesan** — user or assistant turn.
- **Normal mode** / **Deep mode** — the two composer modes.
- **Sumber** / **Source Library** — persisted source records.
- **Artefak** — research document, markdown report, source bundle, citation/evidence view.
- **Laporan** — the markdown report artifact specifically.
- **Kutipan** — a claim-level citation backed by a source.
- **Riset mendalam** — user-facing name for a Deep run.
- **Hentikan** / **Coba lagi** — for Stop / Retry on Deep runs.
- **Perlu istirahat sebentar** — rate-limit framing.

Preferred microcopy:

- "Mencari sumber di korpusmu dan web."
- "Butuh sumber yang lebih kuat untuk klaim ini."
- "Riset selesai. Buka laporan untuk membaca lengkap."
- "Dihentikan. Kamu bisa coba lagi kapan saja."
- "Aqsha sedang membaca 6 sumber."

Avoid:

- "Add to Journal" / "Saved to Journal" / "Journal" — the journal feature has been eliminated from this product.
- "Invalid citation" / "AI hallucinated" / "Verification failed" — speak to the next action, not the failure.
- "Queued" / "Running" / "Retrying" / "Waiting" as user-visible labels — those are workflow internals.
- "Let AI do your research for you" — the product assists; it does not replace judgment.

## 10. Agent Prompt Guide

### Quick color reference

- Bg: Paper Bg `#fff7f0` (light) / Charcoal `#181818` (dark)
- Surface: Raised Paper `#fffdf8` / Dark Card `#202020`
- Text: Ink `#1a1f2b` / Warm Mist `#f4f1ea`
- Muted: Ink Muted `#4b5563` / Dark Muted `#a3a3a3`
- Border: `#e5e7eb` / `#2d2d2d`
- Primary / Normal: Sky `#4a90f7`
- Linked / Source / Done: Mint `#2ecc9a`
- Note / Partial: Lemon `#ffd84d`
- Attention / Retry: Coral `#ff6b6b`
- Deep / Review: Lavender `#bd86ff` (light) / `#b0a6ff` (dark)

### Example component prompts

- "Build the Aqsha composer: raised paper card, 14px radius, textarea on row one, mode switch (Normal | Deep) on the bottom-left, Send button on the right. When a Deep run is active, replace Send with a Coral ghost Stop button and disable the textarea. No send arrow icon inside the pill; keep the surface calm."
- "Design an inline step block for Deep research progress: 10px radius, 1px border, left icon slot (sky spinner / mint check / coral square / ink dot), label using shimmer-text while active, optional right count chip. Never show the words 'queued' or 'retrying'."
- "Build the right panel with two tabs, Sources and Artifacts. Use tab-btn styling — 2px bottom border accent in Sky when active, count pill in sky-soft. The panel is conditional; it only renders when sources or artifacts exist for the active thread."
- "Design a source card: raised paper, mint-soft origin chip, Inter 14px title, mono DOI row, quoted extract with lemon-soft left border, and a footer with 'Buka sumber' + 'Salin kutipan'. Do not include 'Add to Journal'."
- "Build a dark-mode version of the chat: charcoal `#181818` background, `#202020` surfaces, `#f4f1ea` text, accents as tinted glass (low-opacity fills), never pure black, never navy, never AI-purple."

### Iteration guide

1. Use the tokens above. Do not introduce one-off hex values.
2. Keep accents in their roles — Sky ≠ Mint ≠ Lavender. A Deep indicator is lavender; a done indicator is mint.
3. Prefer Inter for dense app surfaces; Nunito only for titles and brand moments.
4. Hide execution internals. If a label reads like a workflow state, rewrite it as user-facing progress.
5. No journal. No "Add to Journal" button, no "Saved to Journal" chip, no Shared Journal.
6. One right panel with tabs, not two panels.
7. Two modes — Normal and Deep. Normal can still call tools.
8. Dark mode is first-class; design it in parallel, not after.
9. Cards for real objects only (message, source, artifact, run, dialog). No nested cards.
10. Motion is restrained; respect `prefers-reduced-motion`.
