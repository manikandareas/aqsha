# Rencana: sub-agen khusus untuk verifikasi kutipan & bukti pembanding (mode /deep)

Status: **TERIMPLEMENTASI 2026-06-14** (3 slice; Slice 2 `verifyIdentifiers` diambil) · Tanggal: 2026-06-14 · Lingkup: `apps/agents` + `packages/agent-contracts` · Sisa: 1 release gate E2E manual `/deep` (lihat §12)

## 1. Konteks & tujuan

Mode **Deep research** (`/deep`) berjalan sebagai rantai 5 fase. Saat ini hanya fase **pencarian literatur** yang mendelegasikan kerja ke sub-agen (fan-out `literature-searcher`). Dua langkah kualitas — **verifikasi kutipan** (`citation_verify`) dan **bukti pembanding** (`counter_evidence`) — masih dikerjakan _inline_ oleh orchestrator fase itu sendiri.

**Permintaan owner**: jadikan langkah **verifikasi kutipan** dan langkah **bukti pembanding** masing-masing didelegasikan ke **sub-agen tersendiri**, meniru pola fan-out literatur. Langkah `plan`, `literature`, dan `write` tetap.

Dokumen ini adalah hasil audit kode + review desain adversarial, lalu rencana implementasi yang siap dieksekusi.

## 2. Ringkasan eksekutif

Perubahannya kecil dan mesinnya sebagian besar **sudah ada**. Inti (REQUIRED):

1. Flip `useSubagents: true` pada policy `counter_evidence` & `citation_verify` (`deepPhases.ts`).
2. Dua `SubagentDefinition` baru — `counter-evidence` & `citation-verifier` — di `subagents/index.ts`, plus satu builder gabungan ber-key fase.
3. Selektor per-fase di `runManager.ts` (tiap fase hanya melihat sub-agennya sendiri).
4. Tulis ulang prompt kedua fase menjadi pola **delegate-then-consolidate**.
5. Dua entry `SUBAGENT_LABELS` (Bahasa Indonesia, sentence case) + perbaikan komentar drift.
6. Update tes.

Tambahan yang **RECOMMENDED** (memperbaiki bug laten, tapi bukan syarat permintaan): tool `verifyIdentifiers` berbasis daftar (list-based) agar verifikasi kutipan benar-benar berfungsi sebelum artefak ada, plus label tool-nya dan perbaikan drift `systemPrompt.ts`.

Tidak ada perubahan pada `apps/web`, skema `DEEP_PHASES`, broker interaksi, jalur HITL/resume, atau `astra.ts`/`toolPolicy.ts` (kecuali allowlist 1 tool jika slice RECOMMENDED diambil).

## 3. Arsitektur saat ini

`/deep` dieksekusi `RunManager.executeDeepRun()` (`apps/agents/src/runs/runManager.ts:532`) sebagai **5 panggilan `query()` terisolasi** berurutan (tanpa session-chaining antar fase). Tiap fase mem-persist outputnya via `upsertResearchPhase`, dan output itu di-inject ke prompt fase berikutnya (`deepPhases.ts buildDeepPhasePrompt` + `priorOutputsFrom`).

| # | Fase (`DEEP_PHASES`) | `useSubagents` | `maxTurns` | `optional` | `streamsToChat` | Sub-agen |
|---|---|---|---|---|---|---|
| 1 | `plan` | false | 4 | – | false | – (main agent) |
| 2 | `literature` (pencarian) | **true** | 16 | – | false | `literature-searcher` (fan-out) |
| 3 | `counter_evidence` (bukti pembanding) | false | 10 | true | false | – (inline) ← **diubah** |
| 4 | `citation_verify` (verifikasi kutipan) | false | 12 | true | false | – (inline) ← **diubah** |
| 5 | `write` | false | 8 | – | true | – (main agent) |

Sifat penting yang **dipertahankan**: durabilitas (re-dispatch hanya mengulang fase yang belum `done`), cost guard per-dispatch (`maxRunBudgetUsd`), resume HITL per-fase via `sdkSessionId`, dan degrade `optional` (habis turn → `done`-partial, bukan gagal).

Cara fan-out literatur bekerja (pola yang ditiru):
- Saat `policy.useSubagents`, `runManager.ts:663-665` mengoper `options.agents = buildLiteratureSearcherAgents(...)`.
- Tool bawaan `Agent` di-allowlist untuk **semua** fase deep (`toolPolicy.ts:91-94`, di-gate `mode === "deep"`, **bukan** `useSubagents`) — jadi `Agent` sudah tersedia di fase 3 & 4 tanpa perubahan.
- Prompt fase literatur menyuruh orchestrator "Delegate one literature-searcher subagent per sub-question ... **then consolidate their findings yourself**" (`deepPhases.ts:94-95`).
- Output fase = **teks final assistant orchestrator** (`runManager.ts:700,788` → `result.finalText`). Teks sub-agen sendiri **di-drop** di stream bridge; hanya `last_assistant_message` bertahan sebagai ringkasan UI ≤120 char (`hooks.ts:222-226`). Karena itu orchestrator **wajib** diinstruksikan mengonsolidasi hasil sub-agen ke pesan finalnya sendiri.

## 4. Temuan audit kunci (terverifikasi terhadap kode)

1. **Drift `systemPrompt`.** `deepResearchInstructions()` (`systemPrompt.ts:50-59`, dikirim ke **setiap** fase deep via `astra.ts:43`) sudah menyebut sub-agen `planner / literature-searcher / counter-evidence / citation-verifier / writer` — padahal **hanya `literature-searcher` yang ada**. Permintaan ini membuat `counter-evidence` + `citation-verifier` jadi nyata; `planner` + `writer` tetap fase main-agent. Drift harus dirapikan agar prompt tak menyatakan hal yang salah.

2. **Bug laten `verifyCitations` butuh `artifactId`.** Tool `verifyCitations` (`citations.ts:33-36`) mewajibkan `artifactId` dan mengekstrak bibliografi dari **teks artefak**. Tapi `citation_verify` (fase 4) berjalan **sebelum** `write` (fase 5) — artefak belum ada. Prompt fase 4 saat ini (`deepPhases.ts:111`) menyuruh "use the verifyCitations tool (preferred)", padahal tool itu **tak terpakai** pra-write; agen jatuh ke `lookupDoi`/`searchArxiv` per-identifier (serial, boros, tak emit `citation_check`). Ini bug yang sudah ada hari ini, independen dari sub-agen.

3. **`background: true` = fire-and-forget (VERIFIED).** SDK `@anthropic-ai/claude-agent-sdk@0.3.175` mendokumentasikan `AgentDefinition.background` sebagai *"Run this agent as a background task (non-blocking, fire-and-forget) when invoked"* (`sdk.d.ts:77`). `literature-searcher` memakai `background: true` (`subagents/index.ts:51`). Pola **delegate-then-consolidate** menuntut orchestrator punya hasil sub-agen _in-context_ pada turn yang sama. Karena itu **kedua sub-agen baru = `background: false`** (lihat D3). Konsekuensi terbuka: belum dipastikan apakah `literature-searcher` (`background: true`) benar-benar terkonsolidasi hari ini atau hanya tampak "jalan" karena fan-out banyak + slack turn — ini di luar lingkup, tapi dicatat sebagai risiko/E2E gate.

4. **Tally `citation_check` tidak ter-nest di kartu sub-agen verifier.** Branch `citation_check` di `activity.ts:569-588` membangun node **tanpa** membaca `parentAgentId` (berbeda dari `tool_start` `:500` & `tool_end` `:562` yang membacanya). Event ini di-emit dari dalam handler tool (`citations.ts:86`), yang tak punya akses `agent_id` (hanya hook yang punya). Selain itu `leafContainers` (`activity.ts:833-835`) mengecualikan sub-agen yang masih open. Akibatnya tally menempel ke **fase**, bukan ke kartu verifier. **Keputusan**: terima tally di level fase (= cara roll-up count literatur), dan jadikan pasangan `tool_start/tool_end` `verifyIdentifiers` (yang **memang** carry `parentAgentId` lewat hook) sebagai child yang ter-nest benar + beri `TOOL_LABELS`. Bukan redesign.

5. **Isolasi map sub-agen wajib per-fase.** `runManager.test.ts:256` meng-assert key `agents` fase literatur **persis** `["literature-searcher"]`. Flat-map gabungan akan membocorkan verifier/counter ke fase literatur dan memecah tes ini. Karena itu builder harus ber-key `DeepPhase` dan di-index `[phase]` (D2).

6. **Token header tes harus dipertahankan.** `runManager.test.ts:312-313` meng-grep substring `"COUNTER-EVIDENCE"` (uppercase) dan `"bukti tersimpan"` pada `calls[0].prompt` di tes re-dispatch. Rewrite prompt **wajib** menjaga token uppercase `COUNTER-EVIDENCE` (dan `CITATION VERIFICATION`) + tetap meng-inject `section("Evidence inventory", priorOutputs.literature)`.

7. **`Agent` tool & MCP sudah tersedia.** `Agent` sudah di-allowlist tiap fase deep (`toolPolicy.ts:91-94`); MCP server expose semua tool tiap fase (`runManager.ts:655`); sub-agen berbagi satu instance MCP + satu counter `nextCitationNumber` per-fase (`runManager.ts:642`). Wiring tak butuh ubah `toolPolicy` (kecuali allowlist `verifyIdentifiers` bila slice RECOMMENDED diambil).

8. **Emisi event sub-agen sudah otomatis.** Hook `SubagentStart`/`SubagentStop` (`hooks.ts:210-233`) memancarkan `subagent_start`/`subagent_stop` dengan `agentType`, `agentId`, dan `summary` dari `last_assistant_message`. `subagentPayloadSchema.agentType` adalah free string. Jadi agentType baru **otomatis** menghasilkan node sub-agen di timeline — hanya butuh tambah `SUBAGENT_LABELS`.

## 5. Keputusan terkunci

| # | Keputusan | Alasan |
|---|---|---|
| D1 | Key sub-agen: **`counter-evidence`** & **`citation-verifier`** (pendek, konsisten dgn `literature-searcher`). Key di map `SubagentDefinition` **harus identik** dengan key `SUBAGENT_LABELS`. | Label dipetakan via `agentType` (= key map). |
| D2 | **Satu builder gabungan** `buildDeepResearchSubagents()` mengembalikan `Partial<Record<DeepPhase, Record<string, SubagentDefinition>>>`. `buildLiteratureSearcherAgents` dipertahankan byte-stable & didelegasikan. **Bukan** flat-map, **bukan** tiga builder terpisah. | Isolasi per-fase (temuan §4.5). |
| D3 | **`background: false`** untuk kedua sub-agen baru. | `background: true` = fire-and-forget (§4.3); konsolidasi butuh hasil in-context. |
| D4 | `counter_evidence` & `citation_verify` **tetap `optional: true`**. | Path degrade `runManager.ts:752-754` bergantung padanya — jangan dihapus. |
| D5 | **Satu `counter-evidence` sub-agen per fase** (tanpa fan-out per-conclusion terstruktur). Prompt boleh memberi hint paralel lunak, tanpa knob `maxRounds` lite/pro. | Permintaan berbunyi tunggal ("its OWN dedicated sub-agent"); "load-bearing conclusions" bukan data terstruktur; tiap spawn makan turn orchestrator. Fan-out = optimisasi terpisah. |
| D6 | **Satu `citation-verifier` sub-agen** (tanpa fan-out); konkurensi hidup di dalam tool. | `verifyOneCitation` sudah batch (`VERIFY_CONCURRENCY=4`); fan-out level-agen tak menambah nilai. |
| D7 | Tool **`verifyIdentifiers`** (list-based) **masuk lingkup, tapi sebagai slice RECOMMENDED terpisah** dengan PR dinamai jujur ("fix pre-write citation verification"). | Tanpa tool ini verifier mendelegasi ke jalan buntu (§4.2), tapi bug ini ortogonal dari permintaan. Ada cut-line jelas (§9). |
| D8 | `verifyIdentifiers` **mendapat `TOOL_LABELS`**. | Tally `citation_check` tak nest di kartu verifier (§4.4); satu-satunya child terlihat = pasangan tool `verifyIdentifiers`, yang tanpa label render fallback "Menjalankan langkah". |
| D9 | **Tidak ada skill** dilampirkan ke kedua sub-agen. | Skill-routing (`selectDomainPack`) sengaja writer-only; metodologi adversarial diinline di prompt. |

## 6. Desain sub-agen

File: `apps/agents/src/subagents/index.ts`. `SubagentDefinition` (`:11-19`) adalah **subset struktural** dari SDK `AgentDefinition` — semua field yang dipakai (`description/prompt/tools/model/maxTurns/background`) diterima SDK (diverifikasi terhadap `sdk.d.ts:38-92`), tanpa type error.

### 6.1 `counter-evidence` (bukti pembanding)

```ts
const COUNTER_EVIDENCE_TOOLS = RESEARCH_TOOLS; // read-only: searchWeb/searchArxiv/lookupDoi/searchThreadDocuments

export function buildCounterEvidenceAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  return {
    "counter-evidence": {
      description:
        "Adversarially searches for evidence AGAINST the emerging conclusions of an evidence " +
        "inventory — failed/non-replications, contradicting studies, methodological critiques, " +
        "retractions, dissenting reviews.",
      prompt: [
        "You are a counter-evidence researcher. You receive an evidence inventory whose conclusions are emerging.",
        "Search specifically for evidence that WEAKENS or contradicts those conclusions; prefer primary",
        "sources and systematic reviews, weight preprints lower and flag them.",
        "Limit yourself to ~3 search rounds; stop when disconfirming evidence saturates.",
        "For each finding: title, identifier (DOI/arXiv/URL), the [n] citation number from the tool result,",
        "a 2-4 sentence extract of HOW it cuts against the conclusion, and a strength rating (strong/medium/weak).",
        "Report honestly when you find none — the absence of rebuttal is itself a result; never fabricate opposition.",
        "Only report sources that came from tool results; keep the [n] numbers; never invent identifiers.",
      ].join(" "),
      tools: COUNTER_EVIDENCE_TOOLS,
      model: deepModel,
      maxTurns: 8,
      background: false, // D3: delegate-then-consolidate butuh hasil in-context
    },
  };
}
```

### 6.2 `citation-verifier` (verifikasi kutipan)

```ts
// VERIFY_TOOLS dibangun dari sumber tunggal di toolPolicy (lihat §7) untuk hindari literal string ke-3.
const VERIFY_TOOLS = LIST_VERIFY_TOOL_NAMES.map(t); // = [t("verifyIdentifiers")]

export function buildCitationVerifierAgents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Record<string, SubagentDefinition> {
  const deepModel = deepModelForAgent(input.config, input.agentKind);
  return {
    "citation-verifier": {
      description:
        "Verifies a list of collected references (existence, metadata consistency, DOI/arXiv validity) " +
        "without needing a finished document. Run ONE instance over the whole reference list.",
      prompt: [
        "You are a citation verifier. You receive a list of references (title, optional DOI/arXiv,",
        "authors, year, and each reference's [n] number).",
        "Call verifyIdentifiers ONCE with the full list (the 4-step integrity engine batches server-side);",
        "do not verify one-by-one and do not search the web.",
        "Return a per-reference verdict table keyed by the original [n]: status (verified / metadata",
        "mismatch / identifier invalid / not found / unverifiable), the specific issues, and the matched title.",
        "Neutral framing — a flag is not an accusation; recommend manual review for anything uncertain.",
        "Keep the [n] numbers exactly.",
      ].join(" "),
      tools: VERIFY_TOOLS, // sengaja lebih sempit dari counter/literature
      model: deepModel,
      maxTurns: 5, // 1 batched call + write-up, +1 margin bila model memecah daftar
      background: false, // D3
    },
  };
}
```

> **Cut-line slice RECOMMENDED**: bila tool `verifyIdentifiers` (§7) belum dikirim, set `tools: RESEARCH_TOOLS` dan ubah prompt agar verifikasi via `lookupDoi`/`searchArxiv` per-identifier — persis perilaku fase inline hari ini (tanpa regresi).

### 6.3 Builder gabungan + perbaikan komentar header

```ts
export function buildDeepResearchSubagents(input: {
  config: AgentsConfig;
  agentKind: "lite" | "pro";
}): Partial<Record<DeepPhase, Record<string, SubagentDefinition>>> {
  return {
    literature: buildLiteratureSearcherAgents(input), // byte-stable, didelegasikan
    counter_evidence: buildCounterEvidenceAgents(input),
    citation_verify: buildCitationVerifierAgents(input),
  };
}
```

Tambah `import type { DeepPhase } from "@aqsha/agent-contracts"`. **Tulis ulang** komentar header `subagents/index.ts:5-9` (saat ini "the only remaining subagent is the parallel literature-searcher" — jadi salah setelah perubahan ini) menjadi deskripsi tiga sub-agen deep + pemetaan fase-nya. Ini bagian dari REQUIRED (kelas drift yang sama dengan §4.1).

## 7. Perubahan per-file

### `apps/agents/src/agent/deepPhases.ts`
- **`:35-46` policy flip** — `counter_evidence`: `{ maxTurns: 10, useSubagents: true, streamsToChat: false, optional: true }`; `citation_verify`: `{ maxTurns: 12, useSubagents: true, streamsToChat: false, optional: true }`. **Pertahankan `optional: true` & `maxTurns`** (D4).
- **`:101-107` prompt `counter_evidence`** — rewrite delegate-then-consolidate. **Wajib simpan substring uppercase `COUNTER-EVIDENCE`** (tes `:312`) + `section("Evidence inventory", priorOutputs.literature)` (menjaga `"bukti tersimpan"` tes `:313`). Pertahankan `CITATION_DISCIPLINE`. Contoh: *"PHASE 3/5 — COUNTER-EVIDENCE. Delegate to the counter-evidence subagent (via the Agent tool) to run an adversarial pass over the evidence inventory below ... then consolidate the subagent's findings into your final message yourself ..."*.
- **`:109-115` prompt `citation_verify`** — rewrite delegate-to-single-verifier; **hapus baris mati "use the verifyCitations tool (preferred)"** (§4.2). **Wajib simpan substring `CITATION VERIFICATION`** (uppercase). Pertahankan `section("Evidence inventory"...)` + `section("Counter-evidence findings"...)`. Contoh: *"PHASE 4/5 — CITATION VERIFICATION. Delegate to the citation-verifier subagent (via the Agent tool), passing the full reference list (title, identifier, authors, year, and its [n]) ... Consolidate those verdicts into your final message yourself, with neutral framing ..."*.

### `apps/agents/src/subagents/index.ts`
- Tambah import `DeepPhase`, fungsi `buildCounterEvidenceAgents`, `buildCitationVerifierAgents`, `buildDeepResearchSubagents` (lihat §6). `VERIFY_TOOLS` dari sumber tunggal toolPolicy.
- Tulis ulang komentar header `:5-9`.

### `apps/agents/src/runs/runManager.ts`
- **`:32` import** — ganti `buildLiteratureSearcherAgents` → `buildDeepResearchSubagents`.
- **`:663-665` selektor** —
  ```ts
  agents: policy.useSubagents
    ? buildDeepResearchSubagents({ config, agentKind: request.agentKind })[phase]
    : undefined,
  ```
  Pastikan yang di-index adalah variabel `phase` (`DeepPhase` di loop), **bukan** `turnPhase`. `plan`/`write` (`useSubagents: false`) tak meng-index map → `agents` tetap `undefined` (tes `:253` hijau). `literature` identik → `:256` tetap `["literature-searcher"]`.

### `apps/agents/src/agent/systemPrompt.ts` (RECOMMENDED — murah, perbaiki drift)
- **`:53` drift fix** — ganti baris yang menyebut sub-agen tak-ada menjadi: *"Work in durable phases. The plan and write phases run as the main agent. In the literature, counter-evidence, and citation-verification phases, delegate to your subagents (in parallel when their inputs are independent), then consolidate their findings into your own final message for that phase."* Aman: fase `plan`/`write` tetap `agents = undefined`, jadi tak akan mencoba men-spawn agen yang tak diberi.

### `apps/agents/src/tools/citations.ts` (RECOMMENDED, slice 2)
- Refactor loop batch `:51-98` di `verifyCitations` menjadi helper bersama `runVerificationBatch(providers, refs)` + `tally(items)` + konstanta `NEUTRAL_CAVEAT`. `verifyCitations` tetap pakai path `extractCitations(artifact.text)` (byte-stable).
- Tambah tool baru `verifyIdentifiers` (read-only, list-based) ke array `buildCitationTools(ctx)` (`:103`). Schema: `{ references: z.array(VerifyItem).min(1).max(60) }` (mirror `MAX_CITATIONS`); `VerifyItem = { title, doi?, arxivId?, authors?, year?, venue?, citation? }` (`citation` = nomor `[n]`, di-echo balik tanpa ubah). Handler: `runVerificationBatch` → `tally` → `appendRunEvent({ type: "citation_check", payload: { checked, verified, flagged } })` → `jsonResult({ status, summary, items, caveat })`. `annotations: { readOnlyHint: true }`.

### `apps/agents/src/agent/toolPolicy.ts` (RECOMMENDED, slice 2)
- Tambah const baru `LIST_VERIFY_TOOL_NAMES = ["verifyIdentifiers"] as const` dengan komentar yang membedakan verifier **artifact-based** (`CITATION_TOOL_NAMES = ["verifyCitations"]`) vs **list-based**. **Jangan** silent-append ke `CITATION_TOOL_NAMES`.
- Di `allowedToolsForTurn` `:78-83`, spread `...LIST_VERIFY_TOOL_NAMES` ke array `logical` (read-only, auto-allowed, no HITL).
- `subagents/index.ts` impor `LIST_VERIFY_TOOL_NAMES` untuk membangun `VERIFY_TOOLS` (hindari literal string ke-3; ia sudah mengimpor `qualifiedToolName` dari file ini).

### `packages/agent-contracts/src/activity.ts`
- **`:113-119` `SUBAGENT_LABELS`** (REQUIRED) — tambah dua entry, sentence case, bentuk **actor-noun + verb** (meniru `literature-searcher`, **bukan** bentuk `PHASE_LABELS`):
  ```ts
  "counter-evidence": {
    running: "Agen bukti pembanding bekerja",
    completed: "Agen bukti pembanding selesai",
    failed: "Agen bukti pembanding gagal",
  },
  "citation-verifier": {
    running: "Agen verifikasi kutipan bekerja",
    completed: "Agen verifikasi kutipan selesai",
    failed: "Agen verifikasi kutipan gagal",
  },
  ```
- **`TOOL_LABELS`** (RECOMMENDED, D8) — tambah `verifyIdentifiers: { running: "Memverifikasi daftar kutipan", completed: "Daftar kutipan diverifikasi" }` (failed otomatis via `failedTitle`).
- **TIDAK** ubah branch `citation_check` `:569-588` (tetap node level-fase; §4.4). **TIDAK** ubah `subagentPayloadSchema` (`agentType` sudah free string). **TIDAK** ubah `DEEP_PHASES`. **TIDAK** ada perubahan `apps/web` (rendering digerakkan tabel label & generik).

### config
- **TIDAK** ada env knob baru. `literature-searcher` meng-hardcode `maxRounds`/`maxTurns` sebagai konstanta builder — cocokkan pola itu. Knob env per-sub-agen ditunda (§10).

## 8. Tes & perintah gate

**Breaking (hard-fail): tidak ada.** Semua tes existing menjaga batas-fase + bentuk agen literatur/plan, yang dipertahankan.

**Update — `apps/agents/tests/runManager.test.ts`:**
- Happy path (`:248-273`) — perluas assert `agents` ke fase 3 & 4: `expect(Object.keys(calls[2]!.options.agents as object)).toEqual(["counter-evidence"])`; `…(calls[3]!…)).toEqual(["citation-verifier"])`. Jaga `:256` literatur persis `["literature-searcher"]` (anti cross-contamination) + `:253` plan `toBeUndefined`.
- Counter partial-text (`:316-355`, `calls[2]`) — tambah `expect(calls[2]!.options.agents).toBeDefined()` + key `["counter-evidence"]`.
- Citation no-text degrade (`:357-389`, `calls[3]`) — tambah key `["citation-verifier"]`.
- Re-dispatch (`:275-314`) — tetap 3 call. **Catatan implementasi**: runner lokal di tes ini (`:298-302`) hanya menangkap `{ prompt }`; **perluas** agar menangkap `options` juga, lalu assert (non-opsional) `Object.keys(calls[0]!.options.agents) === ["counter-evidence"]` & `calls[1]!` === `["citation-verifier"]` untuk mengunci wiring (catch regresi flat-map). Jaga `:312 toContain("COUNTER-EVIDENCE")` + `:313 "bukti tersimpan"` tetap hijau.

**Baru:**
- `apps/agents/tests/subagents.test.ts` (BARU — modul ini belum punya tes): `buildDeepResearchSubagents` mengembalikan map single-key per fase; `counter-evidence.tools === RESEARCH_TOOLS`; `citation-verifier.tools` = verification-only dan **mengecualikan** semua tool mutating/HITL (`proposeArtifact`, `executeArtifact`, `deleteArtifact`, `createWorkspace`, `renameWorkspace`, `runComputation`) **dan juga** `searchWeb`/`lookupDoi`/`searchArxiv`; `model` via `deepModelForAgent`; **`background === false`** untuk kedua def baru; `maxTurns` = 8 / 5; literatur tetap `["literature-searcher"]` dengan `background === true`.
- `apps/agents/tests/citations.test.ts` (BARU/extend, slice 2): `verifyIdentifiers` dengan provider bundle palsu menjalankan engine 4-langkah per referensi, meng-echo `citation` `[n]`, emit run-event `citation_check`; `verifyCitations` tetap jalan di artefak via helper bersama `runVerificationBatch`.
- `packages/agent-contracts/tests/activity.test.ts` (extend): pasangan `subagent_start`/`subagent_stop` dgn `agentType: "counter-evidence"` & `"citation-verifier"` me-render label running/completed/failed baru; agentType tak dikenal tetap fallback `FALLBACK_SUBAGENT_LABEL`. (slice 2) entry `TOOL_LABELS` `verifyIdentifiers` me-render copy non-fallback.

**Tidak berubah**: `hooks.test.ts` (agent-type-agnostic), `agent.test.ts` (passes `agents` eksplisit).

**Perintah gate** (dari root repo):
```bash
# Tes
bun run --filter '@aqsha/agents' test
bun run --filter '@aqsha/agent-contracts' test
# iterasi satu file:
bun run --filter '@aqsha/agents' test -- tests/runManager.test.ts

# Typecheck: root SUDAH mencakup agents + agent-contracts (+ ui)
bun run typecheck

# Lint: root HANYA fan ke @aqsha/app + @aqsha/convex → jalankan filter eksplisit
bun run --filter '@aqsha/agents' lint
bun run --filter '@aqsha/agent-contracts' lint
```

## 9. Urutan implementasi (slice, blast-radius terkecil dulu)

**Slice 1 — Contracts-only (zero behavior change).** Dua entry `SUBAGENT_LABELS` + coverage `activity.test.ts`. Aman duluan; tanpa def, label dorman. Risiko: nihil.

**Slice 2 — Tool `verifyIdentifiers` (RECOMMENDED).** PR dinamai jujur ("fix pre-write citation verification"). Refactor `runVerificationBatch`/`tally`, tool baru, `LIST_VERIFY_TOOL_NAMES` di toolPolicy, `TOOL_LABELS` entry, `citations.test.ts`. Tool tak terpakai sampai sub-agen mereferensinya; `verifyCitations` byte-stable. Risiko: regresi refactor helper → mitigasi: tes `verifyCitations` lama tetap hijau + tes tool baru.

**Slice 3 — Wiring delegasi (REQUIRED core).** Builder gabungan + dua def (`background: false`) di `subagents/index.ts`, dua policy flip + dua prompt rewrite di `deepPhases.ts`, selektor `[phase]` di `runManager.ts`, drift fix `systemPrompt.ts`, update `runManager.test.ts` + `subagents.test.ts` baru. Ini perubahan user-facing.

**Risiko & mitigasi:**
- **`background: false` belum diverifikasi unit** (fake runner di tes mengabaikan `options.agents` — hanya membaca `prompt`) → **release gate**: satu `/deep` E2E manual (dev-mode) mengonfirmasi (a) timeline menampilkan dua kartu sub-agen baru di bawah fase masing-masing, (b) konsolidasi tidak kosong (hasil sub-agen masuk in-context, bukan `PHASE_BUDGET_EXHAUSTED_NOTE` diam-diam). Dokumentasikan nilai `background` dengan satu baris rationale terkait `sdk.d.ts:77`. **Bonus**: cek apakah `literature-searcher` (`background: true`) benar terkonsolidasi — bila tidak, itu bug laten terpisah.
- **Orchestrator habiskan turn saat spawn** (tiap dispatch `Agent` = 1 turn orchestrator): budget 10/12 cukup untuk 1 sub-agen + konsolidasi. `optional: true` degrade graceful. Naikkan budget hanya bila run nyata menunjukkan exhaustion.
- **Cross-contamination map literatur** → mitigasi map ber-key fase + assert `:256` + assert re-dispatch non-opsional.
- **Beban provider verifier per run** — engine sama yang `verifyCitations` jalankan; kini tiap `/deep` kena `citation_verify`. ~60 ref × ~2 panggilan / konkurensi 4 ≈ 30 round-trip serial. Verifikasi di E2E ~30-50 ref selesai dalam budget `maxTurns: 12` & tak trip rate-limit; bila ya, turunkan konkurensi/cap — **jangan** fan-out.

**Cut-line bila harus**: kirim slice 1 + 3 dengan verifier jatuh ke `lookupDoi`/`searchArxiv` per-identifier (drop slice 2). Permintaan ("tiap langkah punya sub-agennya sendiri") tetap terpenuhi; verifier lemah tapi tanpa regresi (= persis perilaku inline hari ini).

## 10. REQUIRED vs RECOMMENDED vs DITOLAK/DITUNDA

**REQUIRED** (memenuhi permintaan + agar terlihat di UI): policy flip kedua fase + jaga `optional: true`; dua `SubagentDefinition` (`background: false`) + builder ber-key fase; selektor `[phase]` di runManager; prompt rewrite delegate-then-consolidate (jaga token header); dua `SUBAGENT_LABELS`; rewrite komentar header `subagents/index.ts`; update `runManager.test.ts` + `subagents.test.ts` baru.

**RECOMMENDED**: tool `verifyIdentifiers` + `LIST_VERIFY_TOOL_NAMES` + `TOOL_LABELS`-nya + `citations.test.ts`; drift fix `systemPrompt.ts:53`.

**DITOLAK / DITUNDA (scope control):**
- **Fan-out counter-evidence per-conclusion + knob `maxRounds` lite/pro** — DITOLAK cut pertama (§D5). Prompt simpan hint paralel lunak. Promosikan hanya bila run nyata menunjukkan satu agen under-cover.
- **`background: true` untuk sub-agen baru** — DITOLAK (§D3): fire-and-forget memecah delegate-then-consolidate; `optional: true` akan menyembunyikannya sebagai done-partial diam-diam.
- **Lampirkan skill ke sub-agen / skill `counter-evidence` baru** — DITOLAK (§D9): metodologi inline cukup; skill-routing tetap writer-only.
- **Nest presisi `citation_check` di kartu verifier** — DITOLAK: butuh threading `agent_id` ke `RunToolContext` (handler tool tak punya hook context) — non-trivial untuk nilai marginal. Tally level-fase diterima; presisi diperoleh gratis lewat pasangan tool `verifyIdentifiers` + `TOOL_LABELS` (§4.4).
- **Env knob per-sub-agen (`maxTurns`/lebar fan-out)** — DITUNDA: cocokkan pola hardcode literatur; promosikan ke env hanya bila tuning runtime dibutuhkan.

## 11. Lampiran — file referensi

- `apps/agents/src/agent/deepPhases.ts` (`:32-48` policies, `:80-135` prompts)
- `apps/agents/src/subagents/index.ts` (`:5-9` header, `:11-54` defs/builder)
- `apps/agents/src/runs/runManager.ts` (`:32` import, `:575-668` phase loop, `:663-665` selektor agents)
- `apps/agents/src/tools/citations.ts` (`:20-104`), `apps/agents/src/tools/index.ts`
- `apps/agents/src/agent/toolPolicy.ts` (`:17-27`, `:69-96`)
- `apps/agents/src/agent/systemPrompt.ts` (`:50-59`)
- `apps/agents/src/agent/hooks.ts` (`:210-233` emisi subagent_start/stop, `:136,183,204` parentAgentId)
- `packages/agent-contracts/src/activity.ts` (`:94-125` label tables, `:569-588` citation_check, `:813-860` nesting)
- `packages/agent-contracts/src/research.ts` (`DEEP_PHASES`)
- `apps/agents/tests/runManager.test.ts` (`:248-389`)
- SDK: `@anthropic-ai/claude-agent-sdk@0.3.175` `sdk.d.ts:38-92` (`AgentDefinition`, `background` `:77`)

## 12. Status implementasi (2026-06-14)

Ketiga slice dikerjakan; owner memilih **Slice 2 (`verifyIdentifiers`) MASUK**. Semua gate hijau.

**Slice 1 — labels (REQUIRED, zero-risk).**
- `activity.ts`: dua entry `SUBAGENT_LABELS` (`counter-evidence`, `citation-verifier`) — sentence case, bentuk "Agen … bekerja/selesai/gagal".
- `activity.test.ts`: +3 tes (render label baru, failed label, fallback agentType tak dikenal).

**Slice 2 — `verifyIdentifiers` (RECOMMENDED, diambil).**
- `tools/citations.ts`: helper bersama `runVerificationBatch` + `tally` + konstanta `NEUTRAL_CAVEAT`; tool baru `verifyIdentifiers` (list-based, batched 4-step engine, echo `[n]` `citation`, emit `citation_check`, `readOnlyHint: true`). `verifyCitations` byte-stable via helper.
- `toolPolicy.ts`: const `LIST_VERIFY_TOOL_NAMES` (terpisah dari `CITATION_TOOL_NAMES`) → spread ke array `logical` di `allowedToolsForTurn`.
- `activity.ts`: entry `TOOL_LABELS.verifyIdentifiers`. `citations/bibliography.ts`: export `MAX_CITATIONS`.
- `tests/citations.test.ts` (BARU, 4 tes) + 1 tes `TOOL_LABELS` di `activity.test.ts`.

**Slice 3 — wiring delegasi (REQUIRED core).**
- `subagents/index.ts`: `buildCounterEvidenceAgents` / `buildCitationVerifierAgents` / `buildDeepResearchSubagents` (phase-keyed); export `RESEARCH_TOOLS`, local `VERIFY_TOOLS = LIST_VERIFY_TOOL_NAMES.map(t)`; rewrite komentar header; `background: false` kedua agen baru.
- `deepPhases.ts`: dua policy flip `useSubagents: true` (`optional: true` & `maxTurns` dipertahankan); dua prompt rewrite delegate-then-consolidate (token `COUNTER-EVIDENCE` / `CITATION VERIFICATION` + `section("Evidence inventory", …)` dipertahankan; baris mati verifyCitations dihapus; `CITATION_DISCIPLINE` ditambahkan ke fase 4).
- `runManager.ts`: import `buildDeepResearchSubagents` + selektor `…(…)[phase]`.
- `systemPrompt.ts` `:53` + `apps/agents/AGENTS.md`: drift fix (kelas §4.1).
- `runManager.test.ts`: capture `options` di semua runner deep + assert key agen per-fase (happy-path, partial-text, no-text, re-dispatch — mengunci anti flat-map). `tests/subagents.test.ts` (BARU, 5 tes).

**Hasil gate (hijau):** `@aqsha/agents` test **221**, `@aqsha/agent-contracts` test **69**, `bun run typecheck` (semua workspace), `@aqsha/agents` lint, `@aqsha/agent-contracts` lint.

**SISA — release gate E2E manual (BELUM, jangan anggap selesai diam-diam):** `background: false` tak ter-cover unit test (fake runner abaikan `options.agents`). Butuh 1 `/deep` E2E dev-mode: (a) timeline menampilkan dua kartu sub-agen baru di bawah fase masing-masing; (b) konsolidasi tidak kosong (hasil sub-agen masuk in-context, bukan `PHASE_BUDGET_EXHAUSTED_NOTE` diam-diam). Bonus: cek apakah `literature-searcher` (`background: true`) benar terkonsolidasi.
