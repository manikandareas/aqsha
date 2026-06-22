---
description: "Four-step citation verification recipe — existence, metadata consistency, DOI/arXiv validity, and accessibility. Use when checking whether a document's citations or bibliography are valid and not fabricated."
---
## How to run it
Call the **`verifyCitations` tool** with the document's `artifactId` (read it from the
`Artifact ID:` line of the paper in your context, or the attached document). The tool runs
the full four-step engine server-side in a single call and returns a per-reference verdict —
do NOT perform the steps manually with web search; that wastes the step budget and is less
accurate. If no document is in context, ask the user to attach or select the paper first.

## What the engine checks (for interpreting the result)
1. **Existence** — title + author matched against an academic database (OpenAlex/Crossref).
2. **Metadata consistency** — cited author/year/venue compared against the record.
3. **Identifier** — DOI (Crossref) and arXiv ID resolved; title confirmed to match.
4. **Accessibility** — a dead URL only lowers accessibility, not validity; steps 1–3 decide.

## Reporting
A flag is not an accusation: it can stem from a metadata typo, an incomplete database, or a provider outage. Recommend manual verification for flagged items, and use neutral language.
