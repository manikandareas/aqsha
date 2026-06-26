# Aqsha V2 — Fase 8: Discovery Polish

> **STATUS: ✅ DONE (uncommitted, gates hijau, ZERO migration).** Slices 8.0→8.4.
> Branch `feat/v2-phase7-deep-research` (lanjutan). Sisa: owner commit + manual E2E.

## Context

Fase 4 mengirim Discovery Feed yang **fungsional** (For You/Top/Topics, infinite
scroll, save/hide, 3 reader, search tsvector) tapi **kasar secara visual** dan
tanpa augmentasi AI. Fase 8 melengkapi parity discovery.

`06-implementation-phases.md §Fase 8` menyebut 4 fitur AI + live search.
**Keputusan owner menggeser scope:**

- **Visual LEBIH besar dari doc** → port penuh layout editorial "majalah" V1
  (mosaic hero/3-up/feature) + right-rail analytics aside (fact-balance donut,
  momentum sparkline, top-cited, trending topics).
- **AI LEBIH ramping dari doc** → **hanya idea generator → /deep**. DROP
  `explainRelevance`, `consensus` meter, `explainTerm` glossary.
- **Tanya Astra** stub P4 di-wire → buka thread Astra ber-seed (P6/P7 sudah ada).

ZERO migration — semua cache di Redis, semua data viz dari kolom feed yang sudah
ada (`shapeFeedItem` sudah mengemit `trendScore`/`primaryClaim`/`stance*`/`sparkline`).

## Divergence dari doc

| Doc Fase 8 | As-built | Alasan |
|---|---|---|
| 4 fitur AI | **ideas saja** | owner trim |
| Layout card-list apa adanya | **port mosaic + aside V1** | owner minta parity visual |
| `consensus` di `f/[id]` | dropped (juga sudah di-drop P4 Slice 4.4) | owner |
| — | **Tanya Astra → seeded chat** wired | tutup stub P4 |

## Slices (as-built)

### 8.0 — Mosaic layout port (frontend, ZERO backend)
Port editorial V1 ke `apps/web-v2/features/discovery/`, rewire Convex→Eden/TanStack,
**drop lang** (id-only), **drop nuqs** (useState nav), **drop explainRelevance** UI,
save via `SaveToWorkspaceButton` (icon) bukan WorkspacePickerPopover.
- `model.ts` (DiscoveryItem + mapper + href + kind helpers), `format.ts`
  (reader-format + verdict-style + formatters), `nav.ts` (mode/topic/range).
- `components/`: `discovery-visuals` (VerdictBadge/StanceTally/Sparkline/Donut),
  `discovery-item-card` (hero/feature/standard/claim), `discovery-list-item`,
  `discovery-toolbar` (mode nav + range filter), `discovery-page` (rewrite:
  TanStack infinite + mosaic rhythm + 4-auto-load budget).
- `SaveToWorkspaceButton` + `ariaLabel` (icon-only a11y).

### 8.1 — Right-rail analytics aside (derive client-side, ZERO endpoint)
`aggregate.ts` (deriveTopTopics/VerdictBreakdown/TopCited/TopicMomentum) +
`discovery-aside.tsx`. Derive dari **`useFeedHome`** (pool /feed/home stabil) →
tak perlu route baru. Wired 2-kolom grid di page.

### 8.2 — Live search augmentation (`consumeCredits('external_search')`)
- `ExploreService.searchPapers`: waterfall **OpenAlex→arXiv→Jina→Crossref(DOI)**
  via `ResearchService` (cached/paced); `candidateToPaperInput` + `dedupeExplorePapers`;
  `extractDoi` (BUKAN normalizeDoi — yang tak validasi) untuk gate Crossref.
- Route `GET /papers/search` (sudah ada) + gate `external_search` saat `mode=search`
  (return-union `blocked`). Recommendations tetap gratis.
- Web: `usePaperSearch` deferred (setelah index tsvector exhausted) +
  `paperToDiscoveryItem`, merge+dedupe vs feed paper-keys + same-session hides.

### 8.3 — Idea generator → /deep + Tanya Astra (`consumeCredits('normal_chat')`)
- `clients/llm.ts`: `generateResearchIdeas` (generateObject + `jsonSchema` ai@6, tanpa zod).
- `FeedAiService.generateIdeas` (RAG OpenAlex konteks → FINER 1–3; cache Redis;
  cache-hit TIDAK debit; model gagal → canned cold-start). Route `POST /feed/ideas`.
- Web `IdeaDialog` → launch `/app/threads?seed=/deep <q>`. Seed via composer
  `initialText` (one-time useState) ← `threads/page.tsx` `searchParams.seed`.
- Tanya Astra (mosaic card + bento `feed-card`) → `/app/threads?seed=<konteks item>`.

### 8.4 — Tests terpusat
- `explore-service.test.ts` (+waterfall: fill+dedupe+limit, OpenAlex-penuh→skip).
- `feed-ai.test.ts` (cache-hit no-debit, fresh-ok, quota return-union, LLM-fail→canned, clamp 3).
- GOTCHA: mock provider via `spyOn(namespace, fn)` + `mock.restore()`; test menangkap
  bug `normalizeDoi`→`extractDoi`.

## Verification

```bash
bun run typecheck            # 10 ws
bun run --filter '@aqsha/services' --filter '@aqsha/api-v2' test
bun run --filter '@aqsha/web-v2' lint
bun run --filter '@aqsha/web-v2' eve:build
```

Manual E2E (set `OPENALEX_API_KEY`/`JINA_API_KEY`/`OPENAI_API_KEY`; seed feed via
`POST /admin/feed/hydrate`):
1. `/app/explore` → mosaic + aside render.
2. Search → list + paper live eksternal tergabung; kredit `external_search` turun;
   kuota habis → notice "Kuota pencarian web habis".
3. "Cari celah" → IdeaDialog 1–3 FINER → klik → composer `/deep` prefilled.
4. "Tanya Astra" → thread Astra ber-seed konteks item.

## Skipped (sengaja)

- `consensus`/`explainRelevance`/`explainTerm` → drop (owner). Infra
  (`FeedAiService`+cache+credit gate) sudah ada polanya.
- Explore-embedded chat side-panel V1 → defer (Tanya Astra cukup navigate-to-thread).
- Cross-session hidden-refs untuk paper live belum-materialized → same-session hide saja.
- `feed_consensus` table → tak dibuat.
