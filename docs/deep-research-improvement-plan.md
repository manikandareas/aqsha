# Plan Improvement Deep Research untuk `apps/api` dengan AI SDK v6

> **Status**: Approved plan, ready to execute
> **Target**: `apps/api` agent runtime (Astra)
> **Stack**: AI SDK v6 (`ai@^6.0.168`), `@ai-sdk/openai`, `@ai-sdk/mcp`, Drizzle + Postgres, Elysia + Bun
> **Last updated**: 2026-05-05

---

## 1. Baseline saat ini (apa yang sudah ada)

| Komponen | Status |
|---|---|
| Agent framework | `ToolLoopAgent` v6 (`ai@^6.0.168`), satu agent tunggal `Astra`, `stopWhen: stepCountIs(20)` |
| Provider | `@ai-sdk/openai` (Responses API) dengan `reasoningEffort` / `reasoningSummary` |
| External tools | 1 MCP server (Exa: `web_search_exa`, `web_fetch_exa`) via `@ai-sdk/mcp` |
| Internal tools | `loadSkill`, `readSkillResource` (filesystem skills) |
| Deep-research | **Hanya berupa skill markdown** (`skills/deep-research/SKILL.md` + 6 reference files) — dijalankan inline di satu loop, tidak ada sub-agent |
| Memory | Tidak ada. Setiap run memulai fresh; hanya `chat_messages` + `chat_sources` + `agent_events` di Postgres untuk telemetri/audit |
| Embeddings / RAG | **Schema sudah disiapkan tapi di-comment-out** (`sources`, `source_chunks`, `embeddingStatuses`) — siap diaktifkan |
| Reranking | Belum ada |
| Structured output | Tidak ada — final report keluar sebagai free-form markdown text |
| Sub-agents | Tidak ada |
| Loop control | Hanya `stepCountIs(20)`. Tidak ada `prepareStep`, `activeTools` per fase, atau context compaction |

### Kelemahan utama untuk kasus deep-research

1. Satu agent harus melakukan semuanya (scope → query → fetch → evaluate → synth → verify) di satu context window — gampang lupa atau drift di topik panjang.
2. Tidak ada decomposition: query tidak di-fan-out paralel, tidak ada budget per cabang.
3. Skill `deep-research` adalah *playbook prosa* — tergantung disiplin model untuk dipatuhi. Tidak deterministik.
4. Tidak ada evidence cache: query yang sama atau URL yang sama bisa di-fetch ulang setiap conversation.
5. Final report tidak ter-validate (tidak ada schema). Citation `[S1]…` cuma string, tidak terikat ke `chat_sources`.
6. Tidak ada verification/critic pass — `verification-checklist.md` ada di skill tapi tidak di-enforce.

---

## 2. Strategi: empat lapisan improvement

Saya rekomendasikan dipecah jadi **4 fase berurutan** yang masing-masing punya nilai mandiri (bisa di-merge per-PR), bukan satu refactor besar.

```
Fase 1: Sub-agent decomposition  →  immediate quality win
Fase 2: Tooling baru (fetch/read/rerank)  →  source quality
Fase 3: Memory & embeddings (evidence cache + semantic recall)  →  efisiensi & continuity
Fase 4: Structured report + verification critic  →  faithfulness & determinisme
```

---

## 3. Fase 1 — Decompose Astra → orchestrator + sub-agents

### 3.1 Arsitektur target

Mengikuti pattern resmi AI SDK v6 [Sub-agents](https://ai-sdk.dev/docs/agents/subagents) dan hub-and-spoke dari [Multi-Agent Research System tutorial](https://medium.com/@kenzic/build-a-multi-agent-research-system-with-ai-sdk-6-5bb5b24452b4):

```
Astra (orchestrator, parent ToolLoopAgent — stays user-facing & streamed)
 ├─ tools.research_planner       → PlannerAgent (returns structured plan)
 ├─ tools.research_searcher      → SearcherAgent (fan-out queries, dedup, rank)
 ├─ tools.research_reader        → ReaderAgent (deep-fetch + extract evidence cards)
 ├─ tools.research_synthesizer   → SynthesizerAgent (themes/conflicts/gaps)
 ├─ tools.research_critic        → CriticAgent (verification pass, flag fabrications)
 ├─ tools.loadSkill (existing)
 └─ tools.readSkillResource (existing)
```

### 3.2 Kenapa sub-agent (bukan satu loop)

- **Context isolation**: setiap sub-agent invocation dapat fresh context window — orchestrator tidak terbebani transcript Exa hasil mentah ratusan KB ([docs](https://ai-sdk.dev/docs/agents/subagents)).
- **`toModelOutput`**: sub-agent boleh "think" puluhan ribu token, lalu yang masuk balik ke orchestrator hanya ringkasan terstruktur — pola resmi AI SDK.
- **Stop conditions per role**: planner cukup `stepCountIs(3)`, reader bisa `stepCountIs(8)`, orchestrator tetap `stepCountIs(20)`.
- **Parallelism**: orchestrator bisa `Promise.all` panggil beberapa `research_searcher` per sub-question.

### 3.3 Struktur file (mengikuti konvensi `AGENTS.md`)

```
src/agents/
├─ astra.ts              (parent orchestrator — sedikit perubahan)
├─ common.ts
├─ deps.ts
├─ streams.ts
├─ subagents/
│  ├─ planner.ts         (NEW — generateObject untuk plan, stepCountIs(3))
│  ├─ searcher.ts        (NEW — bungkus exa tools + dedup, stepCountIs(6))
│  ├─ reader.ts          (NEW — fetch + extract evidence card, stepCountIs(8))
│  ├─ synthesizer.ts     (NEW — themes/conflicts/gaps, stepCountIs(4))
│  ├─ critic.ts          (NEW — verify citations, stepCountIs(5))
│  └─ index.ts
└─ tools/
   ├─ research-planner.ts        (subagent → tool wrapper)
   ├─ research-searcher.ts
   ├─ research-reader.ts
   ├─ research-synthesizer.ts
   └─ research-critic.ts
```

### 3.4 Contoh kode yang akan kita tulis

```ts
// src/agents/subagents/planner.ts
import { ToolLoopAgent, Output, stepCountIs } from "ai";
import { z } from "zod";

export const researchPlanSchema = z.object({
  question: z.string(),
  depth: z.enum(["quick_scan", "standard_brief", "deep_report"]),
  subQuestions: z.array(z.object({
    id: z.string(),
    text: z.string(),
    sourceClasses: z.array(z.enum(["academic", "news", "policy", "primary", "expert"])),
    minSources: z.number().int().min(1).max(10),
  })).min(1).max(8),
  successCriteria: z.array(z.string()),
  exclusions: z.array(z.string()),
});

export function buildPlannerAgent(opts: { model: LanguageModel }) {
  return new ToolLoopAgent({
    id: "planner",
    instructions: PLANNER_INSTRUCTIONS, // forces PROCEED/REFINE/PIVOT thinking
    model: opts.model,
    output: Output.object({ schema: researchPlanSchema }),
    stopWhen: stepCountIs(3),
  });
}
```

```ts
// src/agents/tools/research-planner.ts (subagent-as-tool)
import { tool } from "ai";
import { z } from "zod";

export function createResearchPlannerTool(deps: { plannerAgent: PlannerAgent }) {
  return tool({
    description: "Plan a deep research request. Returns structured sub-questions, depth tier, and success criteria.",
    inputSchema: z.object({ task: z.string() }),
    execute: async ({ task }, { abortSignal }) => {
      const result = await deps.plannerAgent.generate({ prompt: task, abortSignal });
      return result.experimental_output; // typed as researchPlanSchema
    },
  });
}
```

```ts
// src/agents/astra.ts — diff
const ASTRA_INSTRUCTIONS = `…
For research-heavy requests, follow this multi-agent flow:
1. Call research_planner first to get a structured plan.
2. For each sub-question in parallel (max 3 concurrent), call research_searcher.
3. For each high-relevance source, call research_reader to extract evidence cards.
4. Call research_synthesizer once with all evidence cards.
5. Call research_critic to verify citations before final answer.
Never write the final report before the critic returns ok=true.
`;
```

### 3.5 Loop control yang kita tambahkan ke orchestrator

Mengikuti [AI SDK loop control docs](https://ai-sdk.dev/docs/agents/loop-control), tambahkan `prepareStep` di `commonAgentSettings` untuk:

- **Phase-scoped tools**: di step awal hanya boleh `research_planner`; di step tengah hanya `research_searcher` + `research_reader`; di akhir hanya `research_synthesizer` + `research_critic`. Cegah agent skip planner.
- **Budget stop**: tambahan `StopCondition` custom yang menghentikan loop kalau total `usage.inputTokens > BUDGET` (anti runaway cost).

```ts
prepareStep: async ({ stepNumber, steps }) => {
  if (stepNumber === 0) return { activeTools: ["research_planner", "loadSkill"], toolChoice: "required" };
  if (lastToolWas(steps, "research_critic")) return { activeTools: [] }; // force final answer
  return {};
}
```

---

## 4. Fase 2 — Tooling baru di luar Exa

Saat ini hanya Exa. Untuk deep research yang serius, kita butuh:

| Tool baru | Sumber | Fungsi |
|---|---|---|
| `arxiv_search` | arxiv.org API (no key) | Akademik primer |
| `crossref_search` | api.crossref.org (no key) | DOI/citation lookup |
| `pubmed_search` | NCBI E-utilities (no key) | Biomed/medical |
| `fetch_url` (internal) | Bun `fetch` + readability | Fallback ketika Exa fetch gagal / behind paywall |
| `pdf_extract` | `pdf-parse` atau MCP PDF skill | Extract text dari PDF DOI |
| `rerank_sources` | `rerank()` AI SDK + Cohere | Re-order kandidat sumber sebelum di-read |

`rerank()` adalah API native AI SDK v6 ([docs](https://ai-sdk.dev/docs/ai-sdk-core/reranking)). Pattern:

```ts
// di searcher subagent setelah ngumpulin 30 kandidat
const { rerankedDocuments } = await rerank({
  model: cohere.reranking("rerank-v3.5"),
  documents: candidates.map(c => `${c.title}\n${c.snippet}`),
  query: subQuestion.text,
  topN: 8,
});
```

Ini langsung mengurangi noise yang masuk ke ReaderAgent dan menghemat token.

**Tempat code:** `src/agents/tools/` — masing-masing satu file, di-register lewat `commonAgentSettings.externalTools`.

---

## 5. Fase 3 — Memory & embeddings (RAG layer)

### 5.1 Aktifkan tabel yang sudah di-comment-out di schema

`packages/db/src/schema.ts` sudah punya draft `sources` + `source_chunks` + `embeddingStatuses`. Yang perlu kita lakukan:

1. **Tambahkan extension `pgvector`** di migrasi: `CREATE EXTENSION IF NOT EXISTS vector;`
2. **Aktifkan + sesuaikan** kedua tabel; ganti `journalId` jadi opsional, tambahkan `workspace` + `ownerUserId`, lalu tambahkan kolom `embedding vector(1536)` (untuk `text-embedding-3-small`) atau `vector(3072)` untuk `-large`.
3. **Tambah HNSW index**: `CREATE INDEX … USING hnsw (embedding vector_cosine_ops);`
4. **Tambah tabel baru** `research_evidence_cards` (1 row = 1 evidence card terstruktur dari ReaderAgent) — dengan FK ke `chat_sources` (sudah ada) dan kolom `embedding`.

### 5.2 Dua jenis memory yang ditambahkan

| Layer | Disimpan di | Tujuan |
|---|---|---|
| **Source cache** | `sources` + `source_chunks` (dengan embedding) | Skip fetch+chunk ulang URL yang sudah di-read. Bisa cross-thread dalam satu workspace. |
| **Evidence memory** | `research_evidence_cards` | Kalau user balik ke topik serupa minggu depan, SearcherAgent bisa hit memory dulu (`embed(query) → cosineSimilarity vs evidence.embedding`) sebelum keluar ke web. |
| **Conversation memory** *(opsional, fase 3.5)* | tabel `agent_memories` baru | Catatan jangka panjang per user (preferensi format, bahasa, domain) dipanggil orchestrator lewat tool `recall_user_memory`. |

### 5.3 Tools baru di sub-agents

```ts
// src/agents/tools/memory-recall.ts
export function createMemoryRecallTool(deps: { db, embed }) {
  return tool({
    description: "Recall previously cached evidence cards similar to a sub-question. Returns ≤8 items with source IDs.",
    inputSchema: z.object({ query: z.string(), workspaceId: z.string() }),
    execute: async ({ query, workspaceId }) => {
      const { embedding } = await embed({ model: "openai/text-embedding-3-small", value: query });
      return deps.db.execute(sql`
        SELECT id, claim, source_url, 1 - (embedding <=> ${embedding}::vector) AS similarity
        FROM research_evidence_cards
        WHERE workspace = ${workspaceId} AND 1 - (embedding <=> ${embedding}::vector) > 0.78
        ORDER BY similarity DESC LIMIT 8
      `);
    },
  });
}
```

`embed()` dan `embedMany()` adalah API resmi AI SDK ([docs](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)). Dipakai di:

- ReaderAgent: setelah extract evidence card → `embed(claim)` → simpan.
- SearcherAgent: panggil `memory_recall` di awal sub-question.

### 5.4 Wiring DI

Tambah di `src/plugins/services.ts`:

```ts
const memoryRepository = new MemoryRepository(database);
const memoryService = new MemoryService(memoryRepository, openaiEmbeddingModel);
export const servicesPlugin = new Elysia({ name: "plugin.services" })
  .decorate({ agentsService, memoryService });
```

Modul baru `src/modules/memory/` mengikuti konvensi modul wajib (`index.ts` / `model.ts` / `service.ts` / `repository.ts`) sehingga ada juga endpoint admin `/memory/search` untuk debug.

---

## 6. Fase 4 — Structured output + verification critic

### 6.1 Final report sebagai schema, bukan free-form

Mengikuti [unifikasi `generateObject` + `generateText` di v6](https://vercel.com/blog/ai-sdk-6), pakai `Output.object()` di Astra untuk *response terakhir* deep-research:

```ts
const deepResearchReportSchema = z.object({
  question: z.string(),
  depth: z.enum(["quick_scan", "standard_brief", "deep_report"]),
  executiveSummary: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    paragraphs: z.array(z.string()),
    citations: z.array(z.string()), // ["S1","S3"]
  })),
  evidenceConflicts: z.array(z.object({ topic: z.string(), positions: z.array(z.string()) })),
  uncertainties: z.array(z.string()),
  bibliography: z.array(z.object({
    id: z.string(),                 // "S1"
    chatSourceId: z.string().uuid(),// FK to chat_sources
    title: z.string(),
    url: z.string().url().nullable(),
    accessedAt: z.string(),
  })),
  decision: z.enum(["PROCEED","REFINE","PIVOT"]),
});
```

Keuntungan:

- **Citation `[S1]` jadi referensial** — tiap entry bibliography terikat ke baris real di `chat_sources`. Frontend bisa render proper hover-card.
- **Section + paragraphs** terpisah → UI bisa stream per-section dan render outline.
- **Conflicts & uncertainties wajib** → enforce `references/synthesis-and-decision-loop.md` yang sekarang cuma anjuran prosa.

Astra dipakai pakai mode dual: untuk chat biasa tetap free-form text; untuk deep-research di-switch ke `output: Output.object(...)` lewat call options. AI SDK v6 mendukung ini per-call.

### 6.2 Critic sub-agent (verification pass)

Pakai isi `references/verification-checklist.md` jadi **prompt + rule deterministik** di CriticAgent, plus tool checks:

- `verify_citation_exists(sourceId)` → query `chat_sources` table, fail kalau tidak ada
- `verify_url_live(url)` → HEAD request, fail kalau 4xx/5xx
- `verify_quote_in_source(sourceId, quote)` → fuzzy match ke chunk text di `source_chunks`

CriticAgent return:

```ts
z.object({
  ok: z.boolean(),
  issues: z.array(z.object({
    kind: z.enum(["fabricated_citation","dead_link","unverifiable_quote","numeric_mismatch","conflict_undisclosed"]),
    detail: z.string(),
    citationId: z.string().nullable(),
  })),
})
```

Kalau `ok=false`, orchestrator dipaksa loop balik ke synthesizer dengan errors → ini yang membuat sistem benar-benar *self-correcting*, bukan sekadar "model rajin baca checklist".

### 6.3 Telemetri

Tabel `agent_events` sudah punya `agentName` + `parentEventId` + `scope: 'agent'`. Setiap sub-agent invocation tinggal nulis event:

- `scope: "agent"`, `agentName: "planner"`, `status: "running"` → completed
- `parentEventId` ke event orchestrator

Frontend yang sekarang nge-stream events tinggal render timeline multi-agent tanpa DB migration besar.

---

## 7. Hal lain yang dipertimbangkan tapi *bukan* prioritas

| Ide | Verdict | Alasan |
|---|---|---|
| Pindah ke Trigger.dev untuk durable execution | **Tunda** | Trigger.dev pattern bagus untuk PDF export panjang ([Trigger.dev guide](https://trigger.dev/docs/guides/example-projects/vercel-ai-sdk-deep-research)), tapi untuk chat-first UX yang sudah streaming, durable workflow malah menambah latency feedback. Pertimbangkan kalau nanti ada research run > 5 menit. |
| `createDeepAgent` (langchain-ai/deepagents / chrispangg/deepagentsdk) | **Tidak** | Mereka menambahkan virtual filesystem + `write_todos`. Kita sudah punya skills filesystem + tabel `chat_threads`/`agent_runs`/`agent_events`. Mengadopsi framework ketiga akan duplikasi. |
| Tool approval (`needsApproval`) | **Tidak untuk research, ya untuk write actions** | Deep research baca-only. Approval cocok kalau nanti ada tool yang nulis ke jurnal user. |
| AI SDK DevTools | **Ya, di dev** | `npx @ai-sdk/devtools` + `devToolsMiddleware` di dev only — gratis observability untuk debug multi-agent. |
| Ganti model untuk agent kecil | **Ya, planner & critic** | Planner cukup `gpt-5-mini` (cepat & murah). Critic & synthesizer pakai `gpt-5.2` reasoning. Pakai dynamic model di `prepareStep`. |

---

## 8. Roadmap eksekusi (urutan PR)

1. **PR-1 Foundation** — refactor `common.ts` agar `prepareStep` jadi point of customization; tambah `StopCondition` budget. *(zero new feature, satu day)*
2. **PR-2 Sub-agents skeleton** — bikin `subagents/planner.ts` + `tools/research-planner.ts`, integrate ke Astra di balik feature flag `ASTRA_USE_SUBAGENTS`. *(test paling kecil dulu)*
3. **PR-3 Searcher + Reader** — wrap Exa di SearcherAgent, tambah ReaderAgent dengan evidence-card schema; report ke `agent_events`.
4. **PR-4 Synthesizer + Critic + Structured report** — `Output.object` schema; critic loop-back logic.
5. **PR-5 Tooling expansion** — arxiv/crossref/pubmed + `rerank()` Cohere.
6. **PR-6 Memory aktif** — un-comment `sources`/`source_chunks`, migrasi pgvector, `embed()` di ReaderAgent, `memory_recall` tool di SearcherAgent.
7. **PR-7 Long-term memory per user** *(opsional)*.

Tiap PR menjaga konvensi `AGENTS.md` (module folder + DI pattern + `bun-types` only) dan tidak butuh test runner baru.

---

## 9. Sources

- [AI SDK Subagents docs](https://ai-sdk.dev/docs/agents/subagents)
- [AI SDK ToolLoopAgent reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/tool-loop-agent)
- [AI SDK Loop Control (prepareStep, stopWhen, activeTools)](https://ai-sdk.dev/docs/agents/loop-control)
- [AI SDK Embeddings API](https://ai-sdk.dev/docs/ai-sdk-core/embeddings)
- [AI SDK Reranking API](https://ai-sdk.dev/docs/ai-sdk-core/reranking)
- [AI SDK v6 release blog (Vercel)](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Agent Orchestration patterns](https://www.aisdkagents.com/explore/ai-agent-orchestration)
- [Build a Multi-Agent Research System with AI SDK 6 — Chris McKenzie](https://medium.com/@kenzic/build-a-multi-agent-research-system-with-ai-sdk-6-5bb5b24452b4)
- [ai-sdk-deep-research (FranciscoMoretti)](https://github.com/FranciscoMoretti/ai-sdk-deep-research)
- [deepagentsdk (chrispangg)](https://github.com/chrispangg/deepagentsdk)
- [Deep research agent using Vercel's AI SDK — Trigger.dev guide](https://trigger.dev/docs/guides/example-projects/vercel-ai-sdk-deep-research)
