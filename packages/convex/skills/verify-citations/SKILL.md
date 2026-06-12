---
name: verify-citations
description: "Four-step citation verification recipe — existence, metadata consistency, DOI/arXiv validity, and accessibility. Use when checking whether a document's citations or bibliography are valid and not fabricated."
license: Proprietary
metadata:
  author: aqsha
  version: "1.0"
  scope: builtin
  triggerKeywords: [verifikasi, sitasi, fabrikasi, eksistensi, konsistensi, metadata, doi, arxiv, validitas, valid]
---
## Steps
1. **Existence** — match title + author against an academic database (OpenAlex/Crossref).
2. **Metadata consistency** — compare the cited author/year/venue against the record.
3. **Identifier** — resolve the DOI (Crossref) and arXiv ID; confirm the title matches.
4. **Accessibility** — a dead URL only lowers accessibility, not validity; steps 1–3 decide.

## Reporting
A flag is not an accusation: it can stem from a metadata typo, an incomplete database, or a provider outage. Recommend manual verification for flagged items, and use neutral language.
