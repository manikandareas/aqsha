---
name: synthesis-matrix
description: "Literature synthesis matrix — turn the papers in a user's library into a comparison table (Author (Year), Method, Sample, Key findings, Relevance) plus a short synthesis. Use when the user wants a matriks sintesis, penelitian terdahulu, or a Bab 2 comparison of studies."
---
The table and synthesis are Indonesian academic prose; these instructions are in English.

## Gather the sources first
Work only from real papers the user already has. Prefer papers pinned to the turn via `@mention`. Otherwise discover them: `list_artifacts` to see what is in the workspace, `search_thread_documents` to find papers matching the topic, and `get_render_payload` (by `artifactId`) to read a paper's full content when you need method/sample/findings detail. If no library papers are available, ask the user to attach or select them via `ask_questions` — do not invent studies to fill the table.

## Extract per study
For each paper, pull only what the source actually states:
- **Penulis (Tahun)** — first author surname et al. + year.
- **Metode** — design/approach (e.g. eksperimen, survei, studi kasus).
- **Sampel** — population, size, and sampling where reported.
- **Temuan utama** — the study's key result in one clause.
- **Relevansi** — how it connects to the user's topic (gap it fills or contrasts).

Leave a cell blank (or `—`) when the source does not state it. Never fabricate an author, year, number, or finding; if a detail is uncertain, mark it `[perlu sumber]` rather than guessing.

## Produce the artifact
Emit the matrix as a document artifact, not just chat text. First offer it in conversation ("mau saya simpan sebagai dokumen?") naming the topic and the studies to include; once the user agrees, call `propose_artifact` **once** with `title` (short document title) and `markdown` (the full Markdown table plus the synthesis paragraphs). There is no separate execute step — `propose_artifact` creates the document directly. Order rows chronologically or by theme, whichever the user asked for.

## Close with a synthesis
After the table, add one or two paragraphs that read across the rows: recurring methods and findings, where studies agree or conflict, and the gap this points to. Keep claims tied to the rows above — the synthesis summarizes the matrix, it does not add new sources.
