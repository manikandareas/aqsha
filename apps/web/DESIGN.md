# Aqsha Web Design System

## 1. Visual Theme & Atmosphere

Aqsha's web UI should feel like a **playful modern minimalist writing workspace**: bright, calm, rounded, and student-friendly without becoming childish. The product helps students turn scattered sources, notes, and draft ideas into linked academic writing, so the interface should make organization feel light and visible.

The core visual metaphor is:

> Scattered thoughts become simple linked blocks.

The system uses a warm off-white canvas, ink-charcoal text, soft raised paper panels, and a small set of optimistic accents: sky blue, fresh mint, soft coral, lemon, and pale lavender. These colors should behave like the brandkit board: each accent has a clear role, repeats consistently, and never becomes rainbow decoration.

The light reference is bright, tactile, and paper-like. The dark reference is a charcoal workspace using warm-mist text, neutral charcoal surfaces, and the same optimistic accents. Dark mode must not become a blue-black enterprise dashboard or a purple-blue AI gradient.

The interface should feel:

- Airy and bright.
- Rounded but disciplined.
- Friendly to students.
- Calm enough for long writing sessions.
- Structured around sources, notes, links, and drafts.
- Premium through spacing, alignment, and restraint.

Avoid:

- Dark enterprise dashboard mood.
- Severe academic audit aesthetics.
- Generic AI purple-blue gradients.
- Magic sparkles and novelty effects.
- Beige clone styling.
- Mascot-heavy student-app illustration.
- Cards inside cards inside cards.

## 2. Color Palette & Roles

### Core Neutrals

- **Warm Off-White** (`#fff7f0`): page background, workspace canvas, large quiet surfaces.
- **Raised Paper** (`#fffdf8`): cards, popovers, editor panels, floating surfaces.
- **Warm Mist** (`#f4f1ea`): dark-mode high-emphasis text and pale surfaces.
- **Charcoal Black** (`#181818`): dark-mode page background and deepest UI base.
- **Ink Charcoal** (`#1a1f2b`): primary text, icon strokes, high-emphasis UI.
- **Soft Ink** (`#3f4756`): secondary headings, important descriptions.
- **Muted Text** (`#4b5563`): captions, supporting copy, placeholder-adjacent labels.
- **Paper Border** (`#e5e7eb`): default border, separators, card outlines.
- **Input Border** (`#d1d5db`): form fields and editable surfaces.

### Neutral Ramps

Light neutral ramp from the reference board:

- `50` `#fafafa`
- `100` `#f1f3f5`
- `200` `#e5e7eb`
- `300` `#d1d5db`
- `400` `#9ca3af`
- `600` `#4b5563`
- `800` `#1f2937`

Dark neutral ramp for the `#181818` background:

- `50` `#202020`
- `100` `#242424`
- `200` `#2d2d2d`
- `300` `#3a3a3a`
- `400` `#505050`
- `600` `#737373`
- `800` `#a3a3a3`

### Brand Accents

- **Sky Blue** (`#4a90f7`): primary actions, links, active navigation, focus rings, selected source chips.
- **Sky Blue Active** (`#2f73d6`): hover/pressed state for primary actions.
- **Fresh Mint** (`#2ecc9a`): linked/complete/positive states, source-connected moments.
- **Mint Active** (`#22a87e`): stronger success state or active connected chip.
- **Soft Coral** (`#ff6b6b`): destructive actions, mismatch, missing context, gentle attention.
- **Coral Active** (`#eb5353`): hover/pressed destructive state.
- **Lemon** (`#ffd84d`): note highlights, partial support, review reminders.
- **Pale Lavender** (`#bd86ff` light, `#b0a6ff` dark): review, secondary category, optional accent only.

### Semantic Mapping

- **Primary**: `#4a90f7`
- **Primary foreground**: `#fffdf8`
- **Secondary**: `#e9f8f2`
- **Accent**: `#eaf4ff`
- **Muted**: `#f1f3f5`
- **Destructive**: `#ff6b6b`
- **Focus ring**: `#4a90f7`

### Dark Mode

Dark mode is a charcoal workspace, not a blue-black dashboard.

- **Background**: `#181818`
- **Card**: `#202020`
- **Text**: `#f4f1ea`
- **Muted surface**: `#242424`
- **Border**: `#2d2d2d`
- **Muted text**: `#a3a3a3`
- **Primary**: `#4a90f7`
- **Mint**: `#6ee3bf`
- **Coral**: `#ff6b6b`
- **Lemon**: `#ffe082`
- **Lavender**: `#b0a6ff`

## 3. Typography Rules

### Font Families

- **Display / Headings**: rounded modern sans. Prefer `var(--font-heading)`, which resolves through `--font-aqsha-display`, rounded sans fallbacks, then Geist.
- **UI / Body**: `var(--font-sans)`, targeting Inter from the brandkit with Geist as the current repo fallback.
- **Mono**: `var(--font-mono)` for code, citations, command-like snippets, and technical metadata.
- **Handwriting Accent**: `var(--font-handwriting)` only for tiny playful annotations. Use sparingly.

### Hierarchy

| Role | Size | Weight | Line Height | Letter Spacing | Use |
| --- | ---: | ---: | ---: | ---: | --- |
| Display Hero | 4.25rem | 700 | 0.98-1.02 | 0 | landing hero, major brand moments |
| Display Secondary | 3.625rem | 700 | 1.02-1.06 | 0 | large section openers |
| Page H1 | 3.125rem | 700 | 0.98 | 0 | page headers and primary app states |
| Section H2 | 2.375rem | 700 | 1.06 | 0 | section headings |
| H3 | 1.625rem | 700 | 1.23 | 0 | panel headings, feature titles |
| Card Title | 1.375rem | 650-700 | 1.25 | 0 | card and dialog titles |
| Body Large | 1.25rem | 500-600 | 1.4 | 0 | intro copy and key descriptions |
| Body | 1rem | 400-500 | 1.5 | 0 | reading text and app copy |
| Nav / Button | 0.9375rem | 600 | 1.33 | 0 | navigation and commands |
| Caption | 0.875rem | 500 | 1.43 | 0 | metadata and supporting labels |
| Badge | 0.75rem | 650 | 1.33 | 0 | chips, labels, linked states |

### Principles

- Use rounded display typography to make the brand feel friendly and ownable.
- Keep body text clean and readable for long writing sessions.
- Keep letter spacing at `0`; use weight, line height, and color for hierarchy.
- Do not use oversized marketing type inside dense app panels.
- Headings should feel compact and confident, not loud.
- Avoid all-caps labels unless the text is short and functional.

## 4. Component Styling

### Buttons

**Primary**

- Background: `#4a90f7`
- Text: `#fffdf8`
- Hover: `#2f73d6`
- Radius: 8-10px for app buttons, 9999px only for marketing CTAs or pills.
- Padding: 8-12px vertical, 14-18px horizontal.
- Active: `translateY(0) scale(0.985)` or equivalent subtle press.
- Use for: main create/save/continue actions.

**Secondary**

- Background: `#e9f8f2` or `#f3efe8`
- Text: `#1a1f2b`
- Border: `1px solid #e5e7eb`
- Hover: tint toward sky blue or mint, not gray-only.
- Use for: alternate actions and non-destructive flows.

**Ghost**

- Background: transparent.
- Text: `#1a1f2b` or muted text depending on hierarchy.
- Hover: soft surface fill, usually `#f3efe8` or primary at 8-12% mix.
- Use for: toolbar actions, navigation items, compact controls.

**Destructive**

- Background: `#ff6b6b`
- Text: `#fffdf8`
- Hover: `#eb5353`
- Use only for irreversible or high-risk actions.

### Chips & Badges

Chips are central to Aqsha's product metaphor. They should look like small linked blocks.

- Radius: 9999px.
- Min height: 28px.
- Padding: 4px 10px.
- Font: badge scale, 650 weight.
- Border: 1px tinted toward the chip meaning.
- Use consistent color roles:
  - Draft: sky blue.
  - Source: mint.
  - Note: lemon.
  - Link: coral.
  - Review: lavender.

### Cards & Panels

- Background: `#fffdf8`.
- Border: `1px solid #e5e7eb`.
- Radius: 14px standard, 18px for prominent panels, 24px for large product previews.
- Shadow: use `--shadow-soft-card` for standard elevation and `--shadow-deep-card` for dialogs or hero panels.
- Use cards for real objects: source cards, note cards, draft previews, review panels, dialogs.
- Avoid wrapping whole page sections in giant decorative cards.
- Avoid nested cards unless the inner object is semantically different and needs its own affordance.

### Inputs & Editable Surfaces

- Background: raised paper or page background.
- Border: `1px solid #d1d5db`.
- Focus: `#4a90f7` ring, not a heavy glow.
- Placeholder: muted text at reduced contrast.
- Radius: 8px for compact fields, 14px for prompt/editor inputs.
- Labels sit above inputs.
- Helper and error text sit below inputs.

### Navigation

- App navigation should feel calm and workspace-native.
- Active states use sky blue or a soft sky-blue surface.
- Sidebar surfaces should stay warm and quiet.
- Keep navigation labels short.
- Use icon + text for primary nav, icon-only only when the interaction is obvious and has tooltip support.

### Editor & Research Workspace

The editor is the product's center. It should feel like a clean writing canvas with linked supporting blocks around it.

- Preserve generous editor whitespace.
- Keep source chips and note chips visually close to the text they support.
- Use thin link lines or subtle grouped surfaces for source-to-note-to-draft relationships.
- AI output appears as a suggestion before it mutates the draft.
- Review states should be helpful and calm, not punitive.

Recommended labels:

- Linked.
- Source added.
- Needs source.
- Review note.
- Draft idea.
- Saved to Journal.

Avoid labels like:

- Invalid citation.
- AI hallucinated.
- Your claim is wrong.
- Verification failed.

### Image & Illustration Treatment

- Use abstract paper shapes, student desk objects, notebooks, folders, cards, and soft colored blocks.
- Prefer crisp shadows and tactile flat-lay composition.
- Product UI mockups should show source + note + draft relationships.
- Avoid generic stock people, dark archive imagery, and decorative robots.

## 5. Layout Principles

### Spacing System

Use an 8px base rhythm with enough looseness for editorial balance.

- Micro: 2px, 4px, 6px.
- Compact UI: 8px, 10px, 12px.
- Component spacing: 16px, 20px, 24px.
- Section spacing: 48px, 64px, 80px, 96px.
- Large marketing spacing: 120px when the section needs breathing room.

### Grid & Container

- Max content width: 1200-1280px for marketing and broad app surfaces.
- App surfaces can use sidebar-aware layouts and fluid editor widths.
- Use CSS grid for boards, product previews, and source/note/draft relationships.
- Prefer asymmetric but clear grouping over repetitive equal card rows.
- Marketing pages should reveal one strong idea per viewport.

### Whitespace Philosophy

- Whitespace is part of the brand. Do not fill every gap with chips or fake dashboard detail.
- Keep major content blocks breathable.
- Make the relationship between source, note, and draft visible through grouping, not clutter.
- Use color accents as navigation aids, not decoration.

### Border Radius Scale

- Small controls: 6px.
- Buttons and inputs: 8px.
- Compact cards: 10px.
- Standard panels: 14px.
- Featured cards/dialogs: 18px.
- Large previews: 24px.
- Pills: 9999px.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat | no shadow, optional separator | page canvas, editor background |
| Line | `1px solid #e5e7eb` | dividers, card outlines, panel boundaries |
| Soft Card | `--shadow-soft-card` | cards, source chips, lightweight panels |
| Deep Card | `--shadow-deep-card` | dialogs, popovers, featured previews |
| Focus | sky-blue ring | keyboard focus and active editing states |

Depth should feel tactile and paper-like, never glassy or neon. Shadows should be broad, low-contrast, and tinted by ink charcoal rather than pure black.

## 7. Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile Small | <400px | single column, tighter section padding, reduced chip density |
| Mobile | 400-600px | stacked layout, larger touch targets, simplified side panels |
| Tablet Small | 600-768px | 2-column supporting grids where useful |
| Tablet | 768-1080px | app sidebar and product panels become more visible |
| Desktop Small | 1080-1200px | standard app layout |
| Desktop | 1200-1440px | full layout, max content width |
| Large Desktop | >1440px | centered, generous margins, avoid over-expanding text |

### Touch Targets

- Buttons and icon buttons should be at least 36px tall in app surfaces and 40px+ in marketing flows.
- Chips should remain tappable with at least 28px height.
- Toolbar controls must not rely on hover-only discovery.

### Collapsing Strategy

- Hero display type scales down before wrapping awkwardly.
- Source/research side panels collapse below or behind tabs on mobile.
- Feature boards become stacked but keep chip colors and relationship lines.
- Editor toolbars can scroll horizontally, but text should never overflow buttons.
- Marketing sections keep one primary visual focus on mobile.

## 8. Accessibility & States

### Focus System

- Every interactive element must have a visible focus state.
- Focus uses sky blue with restrained ring opacity.
- Focus must not be represented only by color if the component state is critical.

### Interactive States

- **Default**: paper surface, clear border, readable text.
- **Hover**: slight lift or tint, never strong glow.
- **Active**: subtle press with scale around 0.985.
- **Focus**: sky-blue ring.
- **Disabled**: muted text and lower opacity, but still readable.
- **Loading**: use shape-matched skeletons, not generic spinners.
- **Empty**: show one friendly action and one clear next step.
- **Error**: explain the next action, not blame the writer.

### Color Contrast

- Ink charcoal on warm off-white has strong contrast for primary text.
- Muted text should be used for supporting copy only.
- Lemon backgrounds need ink text, not white text.
- Coral should be reserved for meaningful attention or destructive states.

## 9. Product Language Rules

Use this terminology consistently:

- Journal.
- Research Thread.
- Source Library.
- Linked Ideas.
- Add to Journal.
- Shared Journal.
- Can review.
- Can edit.

Preferred microcopy:

- "Link this idea to a source."
- "This note is ready to move into your Journal."
- "Add a stronger source before using this in your draft."
- "Saved. You can review the linked source later."

Avoid:

- "Write your thesis instantly."
- "Never hallucinate again."
- "Let AI do your research for you."
- "Invalid citation" as the default tone.

## 10. Agent Prompt Guide

### Quick Color Reference

- Background: Warm Off-White (`#fff7f0`)
- Raised Surface: Raised Paper (`#fffdf8`)
- Heading/Text: Ink Charcoal (`#1a1f2b`)
- Secondary Text: Muted Text (`#4b5563`)
- Border: Paper Border (`#e5e7eb`)
- Primary CTA / Link / Focus: Sky Blue (`#4a90f7`)
- Primary Hover: Sky Blue Active (`#2f73d6`)
- Linked / Success: Fresh Mint (`#2ecc9a`)
- Warning / Note: Lemon (`#ffd84d`)
- Attention / Destructive: Soft Coral (`#ff6b6b`)
- Review Accent: Pale Lavender (`#bd86ff`)

### Example Component Prompts

- "Create a clean Aqsha editor panel on warm off-white. Use raised paper cards, ink-charcoal text, sky-blue primary actions, mint source chips, lemon note chips, and soft coral link chips. Keep the layout airy with no nested cards."
- "Design a linked idea chip: 9999px radius, 28px min height, 4px 10px padding, badge text at 12px/650, soft tinted background, 1px tinted border, and a small icon."
- "Build a product card: raised paper background, 1px paper border, 14px radius, `--shadow-soft-card`, title at 22px rounded heading, body at 16px muted text, and one clear action."
- "Create a research workspace layout: document canvas in the center, source chips near relevant text, a compact Research Thread panel, and review states that say what to do next."

### Iteration Guide

1. Use Aqsha tokens from `packages/ui/src/styles/globals.css`; do not introduce one-off colors.
2. Keep the palette bright but disciplined. Use sky blue, mint, coral, lemon, and lavender with clear roles.
3. Use rounded display headings for brand moments and readable sans for dense app surfaces.
4. Preserve generous whitespace; remove decorative micro-UI before adding more detail.
5. Use cards for real objects only: source, note, draft, review, dialog, preview.
6. Make links between ideas visible through chips, lines, grouping, and proximity.
7. Keep warning copy calm and action-oriented.
8. Do not import external design-system language. Aqsha has its own visual system.
