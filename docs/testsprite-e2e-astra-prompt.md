# TestSprite E2E Prompt — Astra Agent (Aqsha)

> **Canonical reference = `docs/product-spec-astra-agent.md` v2.0 §7** (driver-agnostic test plan:
> TestSprite / Claude-in-Chrome / manual). This file is a TestSprite-formatted extract of that plan;
> if they ever diverge, the spec wins. Both reflect post-fix behavior (G1–G8).
>
> Paste the section **"=== TESTSPRITE PROMPT ==="** below into TestSprite (frontend / web test mode).
> Grounded in `docs/product-spec-astra-agent.md` (§3 FR/AC, §5 state model, §7 matrix) and the
> post-fix behavior for findings G1–G8 (`docs/e2e-agent-findings-2026-06-28.md`).
> **Before running:** restart the full dev stack fresh (web :3000, api :3001, agent :4111, worker) so
> the rebuilt agent bundle + FE changes are loaded. Fill in `<<...>>` placeholders (Clerk login).

---

=== TESTSPRITE PROMPT ===

## App under test

Aqsha is a research-assistant web app. Inside it lives an AI agent called **Astra**. Test the Astra
chat experience: streaming chat, slash commands, deep research (`/deep`), human-in-the-loop approval
cards, artifacts, sources, stop/regenerate, and resume-on-refresh.

- Base URL: `http://localhost:3000`
- Authenticated product area: `http://localhost:3000/app` (a new chat opens here; an existing thread
  is `http://localhost:3000/app/threads/<id>`).
- All agent output and UI labels are in **Bahasa Indonesia** — assertions below quote the exact
  on-screen strings; match them literally.
- Tech: Next.js front end; the chat streams token-by-token from a Mastra agent runtime.

## Authentication (required — tests cannot proceed without this)

Login is via Clerk. Use these credentials:
- Email: `<<TEST_EMAIL>>`
- Password: `<<TEST_PASSWORD>>`

Login flow: open `http://localhost:3000`, click the sign-in entry, complete the Clerk form with the
credentials above, then wait until redirected to `http://localhost:3000/app`. If a Clerk one-time
code / 2FA is requested, the test account must have it disabled (cannot be automated).

## Environment notes & out-of-scope (read before asserting)

- The test account is plan **admin** (unlimited credits). **Do NOT** attempt quota/billing-block
  tests — they cannot be triggered on this account.
- TestSprite asserts on the **UI only**. Database-level facts (citation numbers stored, credit
  ledger rows, exact truncation length) are out of scope and are listed as "manual DB check" — do
  not fail a test for these; just report what the UI shows.
- One scenario depends on precise timing (refresh while streaming). Treat it as **best-effort**: if
  the timing window is missed, mark it inconclusive rather than failed.
- The agent calls a real LLM; responses take a few seconds, and `/deep` can take **1–3 minutes**.
  Use generous waits (chat: up to 90s; `/deep`: up to 240s). Recognize "still working" by the
  visible spinner + a live elapsed label starting with **"Sedang bekerja"**.

## Key UI cues (use these to detect state)

- Empty/new chat landing shows the composer with placeholder text and suggestions.
- While the agent works: a spinner with shimmering text **"Astra sedang berpikir…"** or
  **"Astra sedang menyusun jawaban…"**, and the composer's send control becomes a **Stop** button.
- A collapsible process trace labeled **"Sedang bekerja"** while running, collapsing to
  **"Selesai · N langkah"** when done.
- After an answer settles: a **copy** icon and a **regenerate** (circular arrow) icon appear under it.
- Composer placeholder inside a thread: **"Tulis pesan untuk Astra…"**.
- Sources list: a collapsible toggle reading **"N sumber"** (e.g. "12 sumber"); expanded rows show a
  bracketed citation number like **[1]**, **[2]** next to each source title.
- Deep-research plan card: a card titled **"Rencana riset"** with a paragraph plan, a bullet list of
  sub-questions, the line **"Setujui untuk memulai riset, atau tolak untuk membatalkan."**, and two
  buttons **"Setujui"** and **"Tolak"**.
- Destructive-tool approval card (delete): a line ending **"Setujui untuk menjalankan."** with
  buttons **"Setujui"** and **"Tolak"**.

## Test scenarios

For each, perform the steps and assert the expected result. Capture a screenshot on failure.

### TC1 — Basic chat completes with a full answer
1. From `/app`, type: `jelaskan singkat apa itu spaced repetition` and press Enter.
2. Expect: a user message bubble appears with that text; the agent begins streaming (Stop button
   visible, "Astra sedang …" indicator).
3. Wait until streaming finishes (Stop reverts to the send control; copy + regenerate icons appear).
Expected: the assistant answer is non-empty and **ends with a complete sentence** (final visible
character is sentence punctuation such as `.`, `!`, `?`, or `…`), i.e. not cut off mid-word.

### TC2 — Streaming / Stop control state (FR1.2, AC1.2)
1. Send: `tuliskan esai 4 paragraf tentang manfaat membaca buku`.
2. While the answer is streaming, assert the composer shows a **Stop** button (not the send arrow).
3. After it completes, assert the control returns to the send arrow and copy/regenerate icons show.

### TC3 — Empty send is blocked (AC1.3)
1. In an empty composer, press Enter without typing anything.
Expected: no message is sent, no new thread is created, the URL stays on `/app`.

### TC4 — Slash command menu (AC2.1, AC2.2)
1. In the composer, type a single `/`.
Expected: a command menu opens listing **10** commands grouped into sections
("Tulis Akademik", "Rancang Riset", "Workspace"), including `/paraphrase`, `/expand`, `/summarize`,
`/outline`, `/research-question`, `/methodology`, `/literature-review`, `/deep`, `/artifact`,
`/workspace`.
2. Continue typing `deep` and select the "Deep research" item.
Expected: the composer shows a **deep** chip/mode, ready for a research question.

### TC5 — Stop mid-stream is clean (fix G5)
1. Send: `tuliskan esai panjang dan rinci tentang sejarah kopi di dunia`.
2. While streaming (a few paragraphs visible), click **Stop**.
Expected: streaming halts; the partial text remains visible; the control returns to the send arrow.
**No** error overlay, red error banner, or "1 Issue" badge appears. (Regression check: previously an
`AbortError: BodyStreamBuffer was aborted` surfaced — it must NOT appear.)

### TC6 — Regenerate does not duplicate the user message (fix G6)
1. After any completed answer, click the **regenerate** (circular arrow) icon under it.
Expected: a new answer is generated for the same question, **without** adding a second/duplicate copy
of the user's message bubble. The user question still appears exactly once above the regenerated
answer.

### TC7 — Refresh while streaming resumes (fix G1) — best-effort, timing-sensitive
1. Send: `tuliskan panduan komprehensif dan sangat panjang tentang pola tidur sehat`.
2. As soon as a few paragraphs have streamed (still streaming, Stop visible), **reload the page**
   (browser refresh of the current thread URL).
Expected: after reload, the thread shows the in-progress answer continuing to stream (or already
completed), and the final answer is **complete** (ends with sentence punctuation), not truncated
mid-sentence. If the refresh lands after completion, that still passes (full answer shown). If the
exact mid-stream window is missed, mark inconclusive.
Manual DB check (optional): the persisted assistant message ends with a proper conclusion.

### TC8 — Artifact card survives refresh (fix G7)
1. Send: `buatkan dokumen catatan singkat berisi 3 tips belajar efektif`. If the agent asks a
   clarifying question, answer briefly (e.g. `untuk mahasiswa, bahasa Indonesia`) so it proceeds.
2. Confirm/approve in conversation if prompted, until a **document artifact card** (a card showing a
   title and "Dokumen") appears in the thread.
3. **Reload** the page.
Expected: after reload, the artifact card is still visible in the thread (not lost).

### TC9 — Destructive tool approval card (fix G8, AC5.3)
1. Ensure an artifact exists in the thread (reuse TC8 or create one).
2. Send: `tolong hapus artefak yang tadi`.
Expected: an approval card appears with a line ending **"Setujui untuk menjalankan."** and buttons
**"Setujui"** / **"Tolak"**.
3. Click **"Setujui"**.
Expected: the agent confirms deletion (text like **"Sudah dihapus"**) and the artifact card is
removed. **No** error overlay / "1 Issue" badge appears in the console area. (Regression check:
previously a `tool_result must be preceded by a tool_call` stream error appeared — it must NOT.)

### TC10 — `/deep` shows a plan-gate before researching (fix G2; AC4.1)
1. In the composer select `/deep` (or type `/deep `), then type a specific research question:
   `apa efek konsumsi kafein terhadap kualitas tidur pada orang dewasa?` and send.
2. Wait (up to ~90s) for the plan step.
Expected: a card titled **"Rencana riset"** appears with a prose plan + a bullet list of
sub-questions + the line **"Setujui untuk memulai riset, atau tolak untuk membatalkan."** and
buttons **"Setujui"** / **"Tolak"**. Research has **not** started yet (no final cited answer present).

### TC11 — Approve `/deep` → cited synthesis with sources (fix G2/G3/G4; AC4.2–4.4) — long-running
1. Continuing TC10, click **"Setujui"**.
2. Wait up to **240s**. A process trace runs (steps such as "Menelaah literatur", "Mencari bukti
   tandingan", "Memverifikasi sitasi", "Menulis sintesis"); the elapsed label "Sedang bekerja" ticks.
Expected:
- A final structured answer appears containing inline citation markers like **[1]**, **[2]**.
- Below the answer, a sources section toggle **"N sumber"** appears; expanding it shows sources, each
  prefixed with a bracketed number **[1] / [2] / …** matching the markers in the prose.
Manual DB checks (optional, out of TestSprite scope): `provider_usage_ledger` gains a row with
`feature='deep_research'`; `usage_daily_rollup.feature_counts->>'deep_research'` increments;
`research_sources.citation_number` is populated (not null) for this thread.

### TC12 — Reject `/deep` plan
1. Run `/deep apa dampak olahraga pagi terhadap produktivitas?` and wait for the plan card.
2. Click **"Tolak"**.
Expected: the agent stops; no literature search / cited synthesis is produced; the thread does not
proceed into research.

### TC13 — Ambiguous query → agent asks for context (AC5.2)
1. In a fresh chat send: `bandingkan dua pendekatan itu untuk proyek saya`.
Expected: the agent replies asking for clarification/context as plain text (e.g. it asks which two
approaches / what project), rather than producing a confident answer. No buttoned card is required.

### TC14 — Refresh during `/deep` resumes (fix G1 for workflow) — best-effort
1. Start `/deep apa manfaat dan risiko puasa intermiten?`, approve the plan, and while the research
   process trace is running, **reload** the page.
Expected: after reload, the thread shows the deep-research either still in progress (process trace /
"Sedang bekerja" resumes) or completed with the cited answer + sources. It must not silently lose the
run with an empty thread. If timing is missed, mark inconclusive.

## Reporting

For each TC report: pass / fail / inconclusive, the key assertion observed, and a screenshot on
failure. Group regression checks (TC5 no AbortError, TC6 no duplicate, TC8 card persists, TC9 no
stream error) prominently — these are the previously-broken behaviors being verified as fixed.

=== END TESTSPRITE PROMPT ===

---

## For the operator (not part of the TestSprite prompt)

- Fill `<<TEST_EMAIL>>` / `<<TEST_PASSWORD>>` with a Clerk test account that has 2FA/OTP **disabled**
  (TestSprite cannot complete an emailed code). The default owner account is `admin` plan.
- TestSprite covers UI only. Run these DB queries (dev DB `…@100.75.23.41:5432/aqsha`, not the
  prod `:5435` MCP) to confirm the DB-level fixes after TC11:
  ```sql
  -- deep_research debit recorded today
  SELECT date, feature_counts->>'deep_research' AS deep
  FROM usage_daily_rollup WHERE owner_user_id = :uid ORDER BY date DESC LIMIT 2;
  -- citation_number populated for the /deep thread
  SELECT count(*) total, count(citation_number) with_num
  FROM research_sources WHERE thread_id = :deep_thread_id;
  ```
- If TC1/TC7 answers come back truncated, the agent likely wasn't restarted onto the new build — kill
  orphan processes and start one clean `bun dev`.
