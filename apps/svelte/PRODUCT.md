# Product

## Register

product

## Platform

web

## Users

The primary user is the **student researcher**: final-year undergraduates, master's students, and early academic writers working on a thesis, proposal, paper, or literature review. Their working context is scattered and pressured — sources in one tab, AI answers in another, notes somewhere else, the draft somewhere else again — usually under deadline and a background hum of review anxiety. The job to be done is to turn that scattered research into a clear, organized, review-ready draft without ever losing the link between a claim and the source behind it. The product's home is the project list, and a project's home is its chapter outline — chat and sources orbit the writing, not the other way around. Success in a single session looks like a messy pile of research becoming one draft section the student trusts and can hand to a reviewer.

A secondary reviewer audience — research mentors and supervisors — reaches the product through the Shared Journal (review and edit access). They are not the design target; the surfaces they touch should stay legible to someone reviewing a student's work, not be built for them first.

## Product Purpose

Aqsha keeps research and writing in one place, organized around the student's actual deliverable: a writing project (thesis, journal article, proposal) with an editable chapter outline — each chapter its own DOCX document with autosave, one-click citation insert from the project's source collection, and a bibliography that builds itself from the citations used — a per-project source collection drawn from one account-wide library, and Astra chat that always works inside a project's context. It pairs a serious research engine — Astra (chat plus a durable `/deep` deep-research workflow that plans, runs subagents, and returns cited synthesis), a source library with citation management, and projects — with a calmer, writing-first surface where the path from source to note to draft stays visible. The product exists because the hard part of student research isn't generating text; it's holding sources, claims, notes, and draft sections together as one connected thing. Success is measured by whether a student leaves a session with review-ready writing whose every claim can be traced back to where it came from.

## Positioning

Aqsha keeps research and writing in one place so every idea stays linked to the source behind it — serious research capability delivered without academic severity or AI-safety theater. Ideas, neatly linked.

## Brand Personality

Calm, clear, playful. The voice is friendly to the writer and clear about the work: it treats students as capable writers who need a better workspace, not error-prone users who need policing. Personality shows up as lightness and order — replacing research overwhelm with a sense of momentum — never as decoration for its own sake. Copy leads with clarity, never fear, uses sentence case with no all-caps, and prefers friendly state labels (Linked, Source added, Needs source, Saved to Journal) over punitive warnings. Approachable, but premium-simple rather than corporate or childish.

## Anti-references

- **Fear-driven AI-safety tone.** No "zero hallucination" claims, no red warnings scattered everywhere, no punitive citation policing. Guidance points to the next action; it never scolds.
- **Generic AI SaaS.** No sparkle icons, hero-metric templates, gradient-purple "AI product" clichés, or endless identical feature-card grids.
- **Strict academic / institutional.** No seals, shields, crests, journal-portal severity, or compliance-tool coldness. Serious does not mean severe.

## Design Principles

- **Keep the thread visible.** Every surface should make the link between a claim and its evidence easy to see and close at hand — source, note, and draft stay connected; provenance is never hidden.
- **Clarity over fear.** States and copy guide the next action ("Add a stronger source before using this") instead of scolding. Reach for soft states before severe ones.
- **Calm density.** Show the information a research workflow genuinely needs without noise. Earn category-fluent trust (Linear/Notion-grade familiarity); don't reinvent standard affordances for flavor.
- **Playful in the moments, quiet on the pages.** Personality lives in small touches — a hand-drawn accent, a friendly label, a well-judged micro-interaction — not in loud page-level decoration.
- **Capable, not clinical.** The research engine is serious; the skin is approachable. Never let seriousness tip into institutional severity, and never let approachability tip into toy-like.

## Accessibility & Inclusion

Target **WCAG 2.2 AA**. Body text holds ≥4.5:1 contrast, large text ≥3:1, and placeholder text is held to the same 4.5:1 rather than a muted-gray default. Focus states are visible and every flow — app shell, composer, dialogs — is fully keyboard-navigable. `prefers-reduced-motion` is honored (a reduced-motion block already ships in `globals.css`); every animation needs a crossfade or instant fallback. Data-visualization palettes stay colorblind-safe and never rely on color alone — the `/deep` stance meter already pairs each color with a written label and number and is CVD-validated. Dark mode is a first-class theme, not an afterthought.
