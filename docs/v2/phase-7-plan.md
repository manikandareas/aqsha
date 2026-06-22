# Aqsha V2 — Phase 7 Plan: Deep Research (`/deep`)

> Rencana **eksekusi** Fase 7. Melanjutkan blueprint dari [phase-6-completion-plan.md](phase-6-completion-plan.md) (§7 "P7 dibangun di atas blueprint ini"). Ditulis setelah grounding first-hand terhadap: eve@0.11.6 docs (subagents/sandbox/skills/dynamic-workflows), agent/ + services + db V2 as-built (P6 selesai, commit `6b0887a`), billing P5 as-built, dan source V1 yang akan diport (`apps/agents` deep research: deepPhases / proposeResearchPlan / citations+integrity / skillDelegation / sandbox).
>
> **Plan ini MENGGANTIKAN premis arsitektur P7 di [06-implementation-phases.md](06-implementation-phases.md) Fase 7** sebagaimana phase-6-completion-plan menggantikan premis MCP plan lama. Koreksi utama di §2.

---

## 0. Status & ruang lingkup

| Slice | Status | Isi |
|---|---|---|
| **7.0** | ✅ **done** (branch `feat/v2-phase7-deep-research`, uncommitted→commit) | `/deep` **ada & ter-gate**: SKILL deep-research + `propose_research_plan` (HITL `once()`) + entry composer `/deep` + gate billing `deep_research` saat plan di-approve. Root pakai read-tools 6.4 — **belum** subagent. Gates hijau, ZERO migration. |
| **7.1** | ✅ **done** (branch yang sama) | Subagent dideklarasi: `literature-searcher` (fan-out) + `counter-evidence` + activity per-subagent **live**. **SPIKE re-export 1-baris LULUS** (eve daftarkan tool di namespace subagent, 0 diagnostics). Activity = part `subagent-call` yang sudah ada (TelescopeIcon) — bukan plumbing event terpisah. |
| **7.2** | ⬜ plan | Citation verify: `CitationService` (port integrity engine) + tool `verify_identifiers`/`verify_citations` + subagent `citation-verifier` (feature billing `citation_verify`). |
| **7.3** | ⬜ plan | Writer **di root** (bukan subagent) + domain-pack skills (port `research-*`/`verify-*`) + UI polish (plan card editable, activity grouped, Sources panel reuse, citation verdict render). |
| **7.4** | ⬜ **deferred (opsional)** | Stats-verification sandbox (Docker deny-all + R bootstrap + `verify_statistics`/`run_computation` ROOT tools). **Owner men-defer** — `/deep` fungsional penuh tanpa ini. |
| **7.5** | ⬜ plan | Testing terpusat (service-unit + manual checklist, scope owner = sama pola 6.9). |

**Testing:** ikut keputusan owner P6 — **TIDAK** ada test per-slice. Gate tiap slice 7.0–7.4 = `eve build` hijau + `bun run typecheck` (semua ws) + `bun run --filter @aqsha/web-v2 lint` + smoke manual opsional. Unit/itest dikerjakan di **7.5**.

**Migration: ZERO** (lihat §5). `research_sources` + fitur billing `deep_research`/`citation_verify`/`sandbox_compute` semua **sudah ada** sejak P5/P6.

### Catatan progress (2026-06-22 — 7.0+7.1 as-built)

Tambahan kecil di luar plan + dua **flag owner** yang berdampak ke slice berikut:

- **`@aqsha/services/plan` subpath BARU** — `estimateCredits` (pure) tadinya hanya di barrel db-heavy. Tambah entry tsup `src/plan.ts` + export `./plan` (bundle-safe) supaya tool eve impor granular. Reusable untuk 7.2/7.4.
- **`SendQuotaService` jadi feature-aware** lewat helper `entitlementForFeature`; `SendFeature` di-export. `useSendStatus(feature, enabled)` + `queryKeys.threads.sendStatus(feature)` per-feature.
- **Activity 7.1 = part `subagent-call` yang sudah ada** (eve sudah lower delegasi jadi `dynamic-tool` part `eve.kind:'subagent-call'`, terurut di timeline) → cukup poles label + `TelescopeIcon` di `ToolRow`. **TIDAK** ada ekspos `subagent.called/completed` terpisah (lebih sederhana + tetap terurut). Subscribe child-stream tetap enhancement (→ 7.3 bila perlu kedalaman nested).
- **FLAG-1 (billing 50<60)** — free `monthlyCredits=50` < `DEEP_LITE_CREDITS=60` ⇒ `evaluateGate` (period.ts:168 `remaining<credits`) memblok free di **saldo kredit** sebelum cap 2-run `deepResearchRuns` sempat dipakai. Diimplementasi persis spesifikasi (no billing change). **Keputusan owner diperlukan**: turunkan DEEP_LITE_CREDITS / naikkan kredit free / kecualikan `deep_research` dari balance-check free. Tidak memblok 7.2/7.3.
- **FLAG-2 (subagent child-session)** — declared subagent dapat **child session id**; `ctx.session.id` di tool subagent = child, bukan parent thread. Jadi di dalam subagent: `persistResearch` key `research_sources` ke child (TAK muncul di Sources panel parent), `search_thread_documents` scope RAG ke child (tak lihat attachment parent), `chargeExternalSearch` idempotency pakai child (owner billing tetap benar). **Berdampak ke 7.3.c (Sources panel untuk /deep)**: bila riset dilakukan subagent, sumber tak masuk panel parent. **Fix di 7.3**: oper `parentThreadId` ke tool subagent (via `message` + input tool, atau linkage session eve) sebelum mengandalkan panel. Juga **belum terverifikasi runtime**: propagasi auth/principal ke declared subagent (kalau gagal, `callerId` throw) — item manual-E2E utama.

---

## 1. Keputusan owner

### Baru (2026-06-22, sesi P7)

| # | Keputusan | Implikasi |
|---|---|---|
| **D-I** | **Stats-verification sandbox = defer ke slice opsional terakhir (7.4).** | `/deep` ship dulu sebagai sintesis literatur terverifikasi (plan-gate + subagents + citation-verify). Sandbox stats (statcheck/GRIM/power/metafor di Docker R) dibangun belakangan / bisa dilewati. Rasional: nilai inti `/deep` ≠ statcheck; di V1 pun live-behavior sandbox tak pernah tervalidasi (Daytona-gated, lihat [[astra-phase1-verification-engine]]). |
| **D-J** | **Riwayat `/deep` = LIVE-ONLY** (konsisten D-F P6). | Subagent activity + verification report = stream live saja (dari `subagent.called`/`subagent.completed` + tool output). **Tanpa** tabel `agent_run_events` / `verification_reports`. Reload thread = teks+reasoning+**sources** saja. `research_sources` (mig 0008) tetap satu-satunya yang dipersist. **Mengoreksi** doc-06 P7 yang masih menyebut `agent_run_events` keyed by `runId`. |

### Diwarisi dari doc-06 P7 (tetap berlaku)

- `/deep` **pure model-driven**: SKILL playbook + subagent dideklarasi; **DROP** `DEEP_PHASES`/`DEEP_PHASE_POLICIES`/`RunManager.executeDeepRun`/dynamic-workflow sebagai *driver*.
- Plan-gate = `needsApproval` murni (bukan Branch B V1); resolve via eve `send({inputResponses})`.
- Invariant **dilonggarkan**: **tanpa** ceiling biaya per-run keras (`ASTRA_MAX_RUN_BUDGET_USD` di-DROP) & tanpa budget per-fase. Kontrol biaya = `consumeCredits` per-call + cap **bulanan** deep (P5) + fokus SKILL.
- `Workflow` tool (`ExperimentalWorkflow`) = **opt-in only** escalation, bukan default driver.

---

## 2. Koreksi crux arsitektural (mengganti premis doc-06 P7)

doc-06 P7 ditulis sebelum P6 di-as-built. Tiga premisnya **sudah usang**; grounding mengoreksi:

### C-1 — Tooling = in-process `defineTool`, BUKAN MCP/connections
doc-06 P7 (dan §00/§11) mengasumsikan eve menjangkau data lewat **Aqsha MCP server** + `connections` (`aqsha`/`aqsha_write`), dan hanya sandbox/HITL-tool yang in-process. **P6 as-built MEN-DROP MCP sepenuhnya** (memory [[v2-phase6-completion-plan]], slices 6.4/6.5): semua tool = `defineTool` in-process dengan `externalDependencies: ['@aqsha/services','@aqsha/db']` (dist build, node v25). **P7 mewarisi ini** — `propose_research_plan`, `verify_identifiers`, subagent tools, (dan kelak `verify_statistics`) semua **authored in-process**. Tak ada MCP, tak ada connection, tak ada `connection__aqsha__*`.

### C-2 — Subagent dideklarasi **inherit NOTHING** + sandbox **tak diwarisi**
Ground-truth `subagents.mdx`: declared subagent (`agent/subagents/<id>/`) memperlakukan direktorinya sebagai **agent root sendiri** — punya HANYA instructions/tools/skills/connections/sandbox/hooks yang di-author di bawah `subagents/<id>/`. Slot kosong → **framework default**, BUKAN versi root.

Konsekuensi yang harus dibake:
- **Tiap subagent re-author tool-nya sendiri.** Tak bisa "share root tools". Tapi share **logika** lewat `agent/lib/` + `@aqsha/services` dist (docs: "share typed helpers via `lib/`"). Pola termurah (ponytail): file tool subagent = **re-export 1 baris** dari tool root, mis. `agent/subagents/literature-searcher/tools/search_web.ts` → `export { default } from "../../../tools/search_web.ts";`. Re-export = authoring eksplisit (bukan inheritance) → eve daftarkan sebagai tool subagent. **Gotcha .ts ext** ([[eve-dev-relative-import-extensions]]) berlaku ke import relatif ini.
- **Nama dir subagent ≠ nama tool** (eve tolak build bila tabrakan). Aman: `literature-searcher`/`counter-evidence`/`citation-verifier` tak bentrok nama tool apa pun.
- **Sandbox TIDAK diwarisi subagent.** Maka **stats-verification adalah ROOT-ONLY**. doc-06 C7 ("model/subagent memanggil `verifyStatistics`") **salah untuk declared subagent** — subagent tak bisa menjangkau tool/sandbox root. Hanya **root model** yang memanggil `verify_statistics`. (Slice 7.4, di-defer.)

### C-3 — **Writer = ROOT**, bukan declared subagent
doc-06 P7 melistkan subagent `{literature, counter, citation, writer}`. Tapi output declared subagent = **tool result** (tak ter-stream ke user). Jawaban final `/deep` HARUS stream ke user → ditulis **root** (yang dilihat `useEveAgent`). Ini juga cocok V1: write-phase `useSubagents:false, streamsToChat:true` (root yang menulis). Maka **subagent dideklarasi = 3** (`literature-searcher`, `counter-evidence`, `citation-verifier`); **writer = root** yang me-load domain-pack skill lalu mensintesis + menjaga penomoran sitasi `[n]`.

### C-4 — Live-only: tak ada `agent_run_events`/`runId`/`pending_interactions`
P6 (D-F) sudah men-drop ketiganya; V2 **tak punya konsep `runId`**. Maka (D-J): subagent activity diturunkan dari `subagent.called.data.childSessionId` + `subagent.completed` **di stream live** (browser tetap SATU `useAstraAgent` parent; opsional subscribe child stream `GET /eve/v1/session/:childSessionId/stream` untuk detail nested). Verification report = **output tool live**. `research_sources` di-key `threadId+turnId` (mig 0008, **sudah ada**) — bukan `runId`. doc-06 P7 "mirror ke `agent_run_events` keyed runId" → **DROP**.

### C-5 — Billing deep **sudah jadi di P5**; gate di plan-approval
Grounding billing as-built: `plan.ts` punya `deep_research`/`citation_verify`/`sandbox_compute` di `CreditFeature`, `deepResearchRuns` cap (free=2/starter=3/plus=12/admin=MAX), `requiredPlan` deep→`starter`; `billing/period.ts:167` gate `deepLimitReached`; `billingRepo` hitung deep-run window; `providerUsageLedger` CHECK + `usageDailyRollup` sudah memuat ketiga fitur (mig 0005). ⇒ **ZERO migrasi billing.** Mekanik P7:
- **Gate otoritatif = `propose_research_plan.execute()`** (jalan saat user approve): `requireEntitlement(feature:'deep_research')` → bila cap tercapai, `execute` kembalikan error (model relay "kuota deep habis"); bila ok, `consumeCredits(feature:'deep_research', idempotencyKey:thread+turn)` = increment 1 slot deep bulanan (idempoten saat resume). Plan-approval = commit alami satu deep-run.
- **Pre-check ramah** = `SendQuotaService` di-extend terima `feature` → `GET /threads/send-status?feature=deep_research` → composer (saat `/deep` aktif) tampil notice bila cap tercapai sebelum kirim.
- **Per-step token** tetap debit `normal_chat` (hook P6). `external_search`/`citation_verify` per-call (tool). **Tanpa** ceiling per-run (D-J/doc-06 loose).

---

## 3. eve ground-truth yang dibake (P7-spesifik)

Dari `subagents.mdx`/`sandbox.mdx`/`skills.mdx`/`dynamic-workflows.md`:

- **Delegasi** = eve lower tiap subagent jadi tool `{ message, outputSchema? }`. **`outputSchema` = pemicu task mode** (struktur balik sebagai tool result). DROP flag `background:false` V1 — **ganti `outputSchema`** (doc-06 A4). `message` bawa SEMUA konteks anak (anak tak lihat history parent).
- **Nama tool subagent** = bare path name tanpa prefix (`subagents/researcher/` → tool `researcher`).
- **Skills scoped per agent**: skill di bawah `agent/skills/` hanya untuk **root**; subagent tak melihatnya (dan sebaliknya). Maka domain-pack skill (untuk writer=root) taruh di `agent/skills/` root. Skill yang subagent butuh → salin ke `subagents/<id>/skills/`.
- **`load_skill`** built-in: model load body SKILL on-demand saat `description` cocok intent. Description = routing hint (tulis sebagai task pemicu).
- **`needsApproval`** dari `eve/tools/approval`: `once()` (sekali per tool per session) / `always()` / `never()`. `propose_research_plan` pakai `once()` (pure HITL, no side-effect kecuali billing-commit di approve). Pola sudah terbukti di `propose_artifact.ts` (`always()`).
- **`Workflow` tool** (opt-in): re-export `ExperimentalWorkflow as default` di `agent/tools/workflow.ts`. Hanya menjangkau subagents (no files/network/skills/connections), jalan di QuickJS sandbox terpisah, durable satu step. **Default OFF** (C6) — tambah file ini HANYA bila owner mau fan-out runtime-computed.
- **Sandbox** (7.4, defer): tepat **satu** per agent root. `ctx.getSandbox()` throw bila tak ada. Docker hanya honor `allow-all`/`deny-all`. Pola: factory egress terbuka → `bootstrap()` install R → `onSession({use})` `use({networkPolicy:'deny-all'})`. Seed file via `agent/sandbox/workspace/**` (butuh layout folder `agent/sandbox/sandbox.ts`).

---

## 4. Arsitektur final P7

```
        Browser (web-v2) — SATU useAstraAgent (parent)
        │  /deep <q> → expand client-side (promptCommands) → load_skill deep-research
        │  live: parts (reasoning/tool) + subagent.called/completed cards (per-subagent)
        ▼
   PROSES eve (node v25, single replica, .workflow-data)
   ├─ agent/agent.ts (root, model OpenAI) — WRITER ada di sini (load domain-pack skill, sintesis [n])
   ├─ agent/skills/deep-research/SKILL.md   (orchestration playbook, load-on-demand)
   ├─ agent/skills/research-*/ + verify-*/  (domain packs, untuk writer=root)
   ├─ agent/tools/propose_research_plan.ts  (in-process, needsApproval once(), billing-commit deep)
   ├─ agent/tools/verify_identifiers.ts + verify_citations.ts  (in-process, CitationService)
   ├─ agent/subagents/literature-searcher/  (own tools = re-export research tools; outputSchema → task)
   ├─ agent/subagents/counter-evidence/     (own tools = re-export research tools)
   ├─ agent/subagents/citation-verifier/    (own tools = re-export verify tools)
   └─ [7.4 defer] agent/sandbox/sandbox.ts (docker deny-all) + tools/verify_statistics.ts (ROOT)
        │  externalDependencies @aqsha/services,@aqsha/db (dist) — SATU SSOT in-process
        ▼
   @aqsha/services (dist) ── @aqsha/db (Postgres+pgvector)
   ResearchService (6.4) · CitationService (7.2 BARU) · BillingService (deep gate) · RagService
```

**Sumber state UI (live-only):** (1) live turn + subagent events = `useAstraAgent` stream; (2) Sources panel = Eden `GET /threads/:id/sources` (research_sources, dipersist); (3) plan-gate card + verification verdict = part HITL / tool-output live (tak dipersist).

---

## 5. Migrasi & repo/service (≈ZERO)

**Migration: ZERO.**
- `research_sources` (id, threadId, ownerUserId, turnId, **citationNumber** nullable, origin, provider, title, locator, url, doi, arxivId, snippet, evidenceStrength, discoveryQuery) — **sudah ada** (mig 0008). `citationNumber` siap dipakai writer/verify (opsional di-write-back, lihat 7.2).
- Fitur billing `deep_research`/`citation_verify`/`sandbox_compute` — **sudah ada** di `providerUsageLedger` CHECK + `usageDailyRollup` + `plan.ts` (mig 0005). Cap `deepResearchRuns` + gate `deepLimitReached` jalan.

**Service baru / extend (`@aqsha/services`, dist):**
- **`CitationService`** (BARU, `research/citation.ts` + re-export) — port integrity engine V1 (`apps/agents/src/tools/citations.ts` + `citations/integrity.ts`): `verifyIdentifiers(refs[])` (4-langkah: identifier resolve → existence → metadata consistency → klasifikasi `verified|metadata_mismatch|identifier_invalid|not_found|unverifiable`), `verifyCitations(artifactText|artifactId)` (ekstrak bibliografi → verifyIdentifiers). **Reuse** provider yang SUDAH ada di `ResearchService`/`research/`: `lookupDoi` (crossref), `searchArxiv`, `searchOpenAlex`, `papers/identifiers.ts`, cache Redis `papers/external-cache.ts`. Batch concurrency 4 (V1). Echo `[n]`. Return-shape neutral (caveat).
- **`SendQuotaService.check`/`getSendStatus`** (extend) — terima `feature: 'normal_chat'|'deep_research'`; bila `deep_research` cek `deepLimitReached`.
- **`skillDelegation`** (opsional, `@aqsha/chat-core` pure atau `@aqsha/services`) — port scorer domain-pack V1 (`research-medicine|cs-ml|education|general`, threshold 0.12). **YAGNI-candidate**: pure model-driven berarti writer bisa `load_skill` domain yang tepat via description. Port scorer HANYA bila owner mau routing deterministik; default = skip, andalkan `load_skill`.

**Pure/client (`@aqsha/chat-core`):** tambah entry `/deep` ke `promptCommands` (sudah jadi SSOT pure di P6) — `/deep` di-DROP saat P6 (Lite-only); P7 reaktifkan.

**Tak ada repo DB baru** (research_sources repo + searchSimilar sudah dari 6.4).

---

## 6. Slices

> Pola = vertical tracer-bullet: **service (dist) → eve (tool/skill/subagent) → web-v2**. Gate = `eve build` + typecheck + lint web-v2. Test → 7.5.

### Slice 7.0 — `/deep` ada & ter-gate (skill + plan-gate + entry + billing)
**Tujuan:** `/deep <q>` jalan end-to-end model-driven dengan plan-gate HITL + gate billing deep — **belum** ada subagent (root pakai read-tools 6.4). Tracer paling tipis yang membuat `/deep` "ada".

1. **SKILL `deep-research`** (`agent/skills/deep-research/SKILL.md`) — frontmatter `description`: "Use when the user runs /deep or asks for a thorough, citation-verified research report." Body = metodologi (model-driven): **panggil `propose_research_plan` LEBIH DULU** (plan-gate); setelah approve, fan-out cari literatur per sub-pertanyaan, cari counter-evidence, verifikasi sitasi, lalu tulis jawaban tercitasi; berhenti saat bukti cukup. **Model** yang menentukan alur. (Port semangat `buildDeepPhasePrompt` V1 jadi prosa playbook, bukan loop.)
2. **Tool `propose_research_plan`** (`agent/tools/propose_research_plan.ts`, in-process) — `inputSchema { title, summary?, questions: string[3..6] }`; `needsApproval: once()`. `execute()` (jalan saat approve): (a) `BillingService.requireEntitlement(feature:'deep_research')` → bila cap → return `{ ok:false, reason }` (model relay); (b) `consumeCredits(feature:'deep_research', idempotencyKey: \`${session.id}:${session.turn.id}:deep\`)`; (c) return `{ proposed:true, title, questions }` (no side-effect lain). Pola dari `propose_artifact.ts`.
3. **`SendQuotaService` extend** + **api-v2** `GET /threads/send-status?feature=deep_research` → status deep-aware (cap reached).
4. **web-v2 composer** — reaktifkan `/deep` di `promptCommands`; expand client-side (P6 `resolveCommandDispatch`) jadi prompt yang menyuruh model load skill deep-research + memuat `<q>`; set `agentKind:'deep'` di `onSend` untuk routing pre-check `send-status`. Plan-gate = sudah ke-render lewat HITL card generik P6 (`propose_research_plan` part `approval-requested`) — polish jadi card editable di 7.3.

**Gate:** eve build + typecheck + lint. **uiVisible:** `/deep <q>` → kartu plan (approve/deny) → setelah approve, Astra riset pakai search 6.4 + tulis jawaban tercitasi; deny → batal; cap deep tercapai → notice. Kredit deep turun 1/run + per-search.

---

### Slice 7.1 — Subagent literature + counter-evidence + activity live
**Tujuan:** delegasi fan-out (port `literature-searcher` + `counter-evidence` V1) sebagai declared subagent + tampil per-subagent di UI.

1. **`agent/subagents/literature-searcher/`** — `agent.ts` (`description`: "Searches the literature for one sub-question and extracts the strongest evidence with citations. Run one per sub-question; independent sub-questions may run in parallel.", model OpenAI), `instructions.md` (port prompt V1: cari, utamakan sumber primer, kembalikan title/identifier/[n]/extract 2-4 kalimat/strength, batasi rounds, stop saat saturasi), `tools/` = **re-export 1-baris** `search_web`/`search_arxiv`/`lookup_doi`/`search_papers`/`search_thread_documents` dari root. Task mode lewat `outputSchema` (di-set parent saat delegasi).
2. **`agent/subagents/counter-evidence/`** — sama pola; `description`/`instructions.md` port V1 (adversarial: cari bukti yang MELEMAHKAN, bobot preprint lebih rendah, jujur saat nihil, jangan fabrikasi). `tools/` = re-export research tools.
3. **SKILL deep-research** update — instruksikan model **delegasi** ke `literature-searcher` (paralel per sub-pertanyaan) lalu `counter-evidence`.
4. **web-v2 activity live (D-J)** — `useAstraAgent` ekspos `subagent.called`/`subagent.completed` ke konsumen; renderer activity **grouped per subagent** (nama + spinner→done + ringkas output). **First cut**: card dari called/completed (tanpa subscribe child internals). *Opsional depth*: subscribe `GET /eve/v1/session/:childSessionId/stream` untuk tool-calls nested — tandai sebagai enhancement, bukan blocker.

**Gate:** eve build + typecheck + lint. **uiVisible:** `/deep` → setelah plan, muncul beberapa card `literature-searcher` paralel → `counter-evidence` → root sintesis; tiap card grouped per subagent.

---

### Slice 7.2 — Citation verify (CitationService + tools + subagent)
**Tujuan:** verifikasi integritas sitasi (port V1 `tools/citations.ts`+`citations/integrity.ts`, D-H ditunda dari P6).

1. **`CitationService`** (`@aqsha/services`, BARU) — port engine 4-langkah; reuse provider `ResearchService`/`research/*` yang sudah ada. `verifyIdentifiers(refs[])` (mid-research, tanpa artifact) + `verifyCitations(artifactText)` (post-write). Batch 4, neutral caveat, echo `[n]`.
2. **eve tools** `agent/tools/verify_identifiers.ts` + `verify_citations.ts` (in-process, READ; debit `citation_verify` per-call via `chargeExternalSearch`-style helper, fitur sudah ada). `verify_identifiers` = list-based (panggil SEKALI atas seluruh daftar — V1 `runVerificationBatch`).
3. **`agent/subagents/citation-verifier/`** — `agent.ts`+`instructions.md` (port V1: panggil `verify_identifiers` SEKALI atas full list, jangan one-by-one, jangan search web, kembalikan tabel verdict keyed `[n]`, framing netral, jaga nomor `[n]`), `tools/` = re-export `verify_identifiers`+`verify_citations`.
4. **SKILL** update — delegasi ke `citation-verifier` sebelum/sesudah writer.
5. **(opsional, ponytail-skip default)** write-back `research_sources.citationNumber` saat writer assign `[n]`. Default: verdict live-only; kolom tetap nullable. Aktifkan hanya bila Sources panel mau tampil nomor.

**Gate:** eve build + typecheck + lint. **uiVisible:** `/deep` → setelah literatur, `citation-verifier` keluarkan tabel verdict per-`[n]`; kredit `citation_verify` turun.

---

### Slice 7.3 — Writer di root + domain packs + UI polish
**Tujuan:** sintesis final berkualitas domain + UI `/deep` rapi.

1. **Domain-pack skills (root)** — port markdown V1 `apps/agents/.claude/skills/{research-medicine,research-cs-ml,research-education,research-general,verify-citations,verify-statistics,cite-apa7,meta-analysis-synthesis,replication-readiness,write-academic-id}` → `agent/skills/<id>/SKILL.md`. (Skill scoped root → untuk writer=root.)
2. **Writer = root** — SKILL deep-research instruksikan: setelah bukti+verifikasi cukup, root **`load_skill`** domain-pack yang relevan lalu tulis jawaban tercitasi (`[n]` stabil = tanggung jawab writer/root, bukan orkestrator). *(skillDelegation scorer = opsional/YAGNI; default andalkan `load_skill` model-driven.)*
3. **web-v2 UI polish** — (a) plan-gate **card editable** (port `hitl-plan-review-card` V1; user edit `questions` → resolve `send({inputResponses:[{requestId, text: editedPlanJson}]})` atau approve as-is); (b) activity grouped per subagent (literature/counter/citation) rapi + label; (c) **Sources panel** reuse `GET /threads/:id/sources` (sudah dari 6.4) — pastikan tampil di surface `/deep`; (d) verification verdict render (dari output tool live).

**Gate:** eve build + typecheck + lint. **uiVisible:** `/deep` penuh: plan editable → activity per-subagent → Sources panel live → jawaban final tercitasi bergaya domain.

---

### Slice 7.4 — Stats-verification sandbox (DEFERRED / opsional, D-I)
**Tujuan (bila/ketika dibangun):** `verify_statistics`(auto)/`run_computation`(approval) ROOT tools di Docker deny-all. **Owner men-defer** — bangun belakangan; `/deep` lengkap tanpa ini.

> Catatan port: V1 pakai **Daytona** (`sandboxVendor.ts`); V2 = **re-implementasi** di **eve sandbox Docker** (bukan port langsung). R-scripts (`statcheck`/`grim`/`power`/`metaanalysis`) + klasifier (`statcheckClassify` dst.) + `verificationReport` (verdict ladder `passed|passed_with_notes|needs_review|failed`) port apa adanya jadi lib.

1. **`agent/sandbox/sandbox.ts`** (layout folder) — `docker()` backend; `bootstrap()` egress terbuka → `apt`/install R + paket (`statcheck`/`pwr`/`metafor`); `onSession({use})` → `use({networkPolicy:'deny-all'})`. Seed R-script via `agent/sandbox/workspace/**`. `revalidationKey` versi snapshot. *(Pertimbangkan custom Docker image R-prebaked agar bootstrap cepat — open infra item.)*
2. **ROOT tools** `agent/tools/verify_statistics.ts` (auto, read-only — `ctx.getSandbox()` jalankan Rscript → klasifikasi → verdict; **ROOT-ONLY**, C-2) + `agent/tools/run_computation.ts` (`needsApproval`). Klaim-extract LLM **di luar** sandbox deny-all.
3. **Lib** `@aqsha/services` (atau agent/lib) — classifier + verificationReport (pure, testable). Debit `sandbox_compute` (fitur ada; V1 = 10 kredit, [[astra-phase1-verification-engine]]).
4. **web-v2** — verification report card (live).

**Gate:** eve build + typecheck + lint + `networkPolicy:'deny-all'` aktif di `onSession`. **uiVisible:** paper dgn statistik → `verify_statistics` → verdict card.

---

### Slice 7.5 — Testing terpusat + harden
**Tujuan:** seluruh test sekaligus (pola owner 6.9: **service-unit + DB-itest + manual checklist**, BUKAN harness eve/Playwright dari nol).

- **Service unit (repo-fake / spyOn namespace, BUKAN `mock.module` global — gotcha 6.9):**
  - `CitationService.verifyIdentifiers` (verified / metadata_mismatch / identifier_invalid / not_found / unverifiable; batch; echo `[n]`; provider-failure sentinel).
  - `SendQuotaService.check(feature:'deep_research')` (deepLimitReached → quota_exceeded; ok pass).
  - `propose_research_plan.execute` billing-commit (cap reached → ok:false tanpa consume; ok → consumeCredits idempoten thread+turn).
  - (bila 7.4) classifier statcheck/grim/power + verificationReport verdict ladder (pure).
- **DB-itest** (prefix `itdeep_`, di luar broad cleanup `user_itest_%` — gotcha [[v2-phase5-implementation]]; cleanup FK-child research_sources sebelum users): deep-run cap window (`billingRepo` count `deep_research` ledger dalam period); `consumeCredits(deep_research)` idempoten.
- **Manual checklist (eve-runtime + e2e — owner saat smoke):**
  1. `/deep <q>` → plan card → edit+approve → fan-out `literature-searcher` paralel → `counter-evidence` → `citation-verifier` verdict → jawaban tercitasi. deny plan → batal.
  2. Activity grouped per subagent (live); reload thread → teks+reasoning+**Sources** saja (D-J live-only; activity tak persist).
  3. Cap deep bulanan tercapai → composer notice (pre-check) + `propose_research_plan` approve di-block (return ok:false). Kredit deep turun 1/run + external_search/citation_verify per-call.
  4. Resume `.workflow-data` pasca-crash mid-run → step durability lanjut tanpa double-charge (consumeCredits idempoten).
  5. (bila 7.4) `verify_statistics` di paper berstatistik → verdict card; `run_computation` minta approval.
- **Gate akhir:** `bun run typecheck` (semua ws) ✓; full `bun run test:v2` (`--timeout 30000`) ✓; `bun run --filter @aqsha/web-v2 lint` ✓; `eve build` ✓. NOL migrasi (kecuali owner aktifkan opsi persistensi).

---

## 7. Risiko & open items
- **Subagent re-export tools** — ✅ **RESOLVED (spike 7.1 lulus)**: `export { default } from "../../../tools/x.ts"` di bawah `subagents/<id>/tools/` di-daftarkan eve sebagai tool subagent (manifest discovery `logicalPath="tools/x.ts"`, 0 diagnostics). `.ts` ext wajib. Fallback wrapper tak diperlukan.
- **Subagent child-session scoping** (BARU, dari 7.1 as-built) — lihat FLAG-2 §0. Tool di dalam subagent melihat `ctx.session.id` = child session, bukan parent thread → sumber/RAG ter-scope salah. Fix di 7.3 sebelum mengandalkan Sources panel untuk /deep.
- **Subagent activity depth** — first cut = called/completed cards; subscribe child stream = enhancement. Jangan over-build (ponytail).
- **`outputSchema` task-mode** — pastikan parent set `outputSchema` saat delegasi agar subagent balik terstruktur (bukan free-form). Bila tidak, subagent jalan "konversasi" — masih jalan, tapi konsolidasi root lebih berisik.
- **Deep cap di plan-skip** — bila model TAK panggil `propose_research_plan` (model-driven, invariant longgar), slot deep bulanan tak ter-charge; run jalan sbg chat mahal (per-step normal_chat + external_search). Akseptabel (D-J/doc-06 loose). SKILL diarahkan kuat memanggil plan dulu.
- **`citationNumber` write-back** — default skip (live-only); aktifkan bila Sources panel butuh nomor.
- **7.4 sandbox infra** (deferred) — bootstrap install R lambat first-build (template-cached); pertimbangkan custom image R-prebaked. Docker deny-all hanya all-or-nothing (no domain allow-list) — cukup untuk stats (no egress saat run).
- **arXiv pacer per-proses** (warisan 6.4) — multi-proses melemahkan pacing; Redis token-bucket = follow-up.

## 8. Rekonsiliasi vs doc-06 P7
- **GANTI** premis MCP/connections → **in-process `defineTool` + externalDependencies** (C-1, warisan P6 as-built).
- **GANTI** "subagent {literature,counter,citation,**writer**}" → **3 subagent + writer=ROOT** (C-3); subagent **inherit nothing**, tools re-authored (re-export), sandbox tak diwarisi (C-2).
- **GANTI** "stats verification model/subagent" → **ROOT-ONLY** (C-2); slice **di-defer** (D-I).
- **DROP** `agent_run_events`/`runId`/mirror-per-subagent → **live-only** activity + verification report (C-4, D-J).
- **TETAP:** pure model-driven (skill+subagent, drop `DEEP_PHASES`/`RunManager`), plan-gate `needsApproval once()`, invariant longgar (no per-run ceiling), `Workflow` opt-in, citation integrity engine port, domain packs.
- **Migrasi P7 = ZERO** (research_sources + fitur billing sudah ada).
```
