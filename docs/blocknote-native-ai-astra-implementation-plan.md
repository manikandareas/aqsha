# Plan Implementasi: AI Native BlockNote (`@blocknote/xl-ai`) digerakkan Astra

> Status: **IMPLEMENTATION PLAN** — siap dieksekusi di branch `blocknote`.
> Dibuat 2026-06-30. Bahasa: Indonesia (istilah teknis English), sesuai `CLAUDE.md`.
> Dasar: `docs/blocknote-native-ai-astra-research.md` (riset + PoC gate hijau).
> Arah: **REPLACE TOTAL** jalur custom-overlay + `propose_document_edit` → AI native xl-ai, model = Astra, trigger ganda (in-editor + panel Astra).

---

## 0. Ringkasan & prinsip

Mengganti seluruh tumpukan **durable-suggestion + custom overlay** dengan **engine AI native BlockNote** (`@blocknote/xl-ai`), yang **model LLM-nya diarahkan ke Astra** lewat backend route milik kita. Editor mendapat pengalaman AI Notion-like (slash `/ai`, tombol toolbar AI, AI menu, **diff + Accept/Reject native**), dan **panel Astra** bisa memicu edit yang sama lewat `invokeAI()`.

**Prinsip kunci:**
1. **Satu engine, dua entry point.** xl-ai = engine; in-editor UI **dan** panel Astra (`invokeAI`) memicu engine yang sama.
2. **Backend route = batas Astra.** Di route inilah auth + billing + (nanti) enrich konteks hidup. Model = gateway OpenAI-compatible yang sama dengan `apps/agent/src/mastra/model.ts`.
3. **Otoritas tulis tetap di editor.** xl-ai memodifikasi `editor.document` langsung; autosave existing (`PUT /artifacts/:id/document`) tetap mempersist. Tidak ada record proposal eksternal.
4. **Replace total, bukan hybrid.** Seluruh kategori (A) di §8 dihapus.

---

## 1. Keputusan terkunci (default direkomendasikan — owner konfirmasi yang ditandai ⚠️)

| # | Keputusan | Nilai |
|---|-----------|-------|
| D1 | Posisi xl-ai | **Replace total** custom-overlay + `propose_document_edit`. |
| D2 | Versi BlockNote | **Pin EXACT** `@blocknote/{core,react,shadcn,xl-ai}` = `0.51.4` (temuan PoC: caret → dua copy core → type error). Naikkan keempatnya bareng saat upgrade. |
| D3 | Rumah backend route | **Elysia di `apps/api`** (`OPENAI_BASE_URL`/`OPENAI_API_KEY` + billing + Clerk ada di sini; web pure-consumer ai@7-locked). |
| D4 | Versi `ai` di route | **`ai@6`** (cocok `@blocknote/xl-ai/server`). `apps/api` belum punya `ai` → pin bersih `ai@^6` + `@ai-sdk/openai@^2` (provider ai@6). Tidak menyentuh `ai@7-beta` di agent/web. |
| D5 | Model | **Model A dulu** (engine native + model Astra mentah dari gateway). Desain route agar bisa → Model B (enrich konteks) tanpa ubah client. |
| D6 ✅ | Durabilitas saran lintas-sesi | **DROP di v1** (konfirmasi owner 2026-06-30). xl-ai murni in-editor; "edit saat dokumen tertutup" → affordance "buka dokumen untuk pakai AI". Bila wajib nanti → follow-up phase terpisah. |
| D7 ✅ | Unit billing edit | **Debit per-invoke rate Lite** (konfirmasi owner) via `BillingService.consumeCredits` (event baru `doc_ai_edit`), idempotent. Gate plan sama dengan chat Lite. |
| D8 ✅ | Agent chat memulai edit | **v1 = in-editor + user-driven dari panel** (konfirmasi owner). Agent-driven (`request_document_edit` sinyal → bridge `invokeAI`) = **Fase 3.5 opsional**, bukan v1. |
| D9 | Bahasa + brand | Route **augment** `aiDocumentFormats.html.systemPrompt` dengan instruksi Bahasa Indonesia + brand voice (`BRAND-IDENTITY.md`). |
| D10 | Format dokumen | **`html`** (default/stabil xl-ai). Storage artifact (`blocksJson`/`markdown`/`plainText`) **tidak berubah**. |

---

## 2. Arsitektur target (end-to-end)

```
IN-EDITOR                              PANEL ASTRA
  /ai · tombol toolbar AI · AI menu      user/agent minta edit dokumen terbuka
        │                                       │
        │ (native)                              │ editorRef.getExtension(AIExtension)
        │                                       │   .invokeAI({ userPrompt, useSelection })
        ▼                                       ▼
        └──────────────► AIExtension (engine) ◄─┘
                                │  transport: DefaultChatTransport({ api })
                                │  documentStateBuilder → serialize blok (HTML)
                                ▼
        ╔═══════════════ BACKEND ROUTE (apps/api, Elysia, ai@6) ═══════════════╗
        ║  POST /blocknote-ai/chat                                              ║
        ║  1. Auth Clerk → ownerUserId + assert ownership artifact              ║
        ║  2. Billing gate + consumeCredits (event doc_ai_edit, rate Lite)      ║
        ║  3. streamText({                                                      ║
        ║       model: astraGateway.chat(AQSHA_LITE_MODEL),   ◄── TITIK ASTRA  ║
        ║       system: brandIndoPrompt + aiDocumentFormats.html.systemPrompt,  ║
        ║       messages: injectDocumentStateMessages(convertToModelMessages…), ║
        ║       tools: toolDefinitionsToToolSet(html stream tools),             ║
        ║     }).toUIMessageStreamResponse()                                    ║
        ║  4. (Model B nanti) enrich system/messages via services konteks/RAG   ║
        ╚══════════════════════════════════════════════════════════════════════╝
                                │  UIMessage stream (tool calls: add/update/delete)
                                ▼
        Editor parse → apply sbg SUGGESTION/DIFF (state user-reviewing)
                                │  Accept → editor.document final → autosave PUT /artifacts/:id/document
                                │  Reject → revert
```

---

## 3. Kontrak

### 3.1 Backend route (apps/api)
- **Endpoint:** `POST /blocknote-ai/chat` (Elysia). Auth: macro Clerk existing → `ownerUserId`.
- **Body (dari `DefaultChatTransport`):** `{ messages: UIMessage[] }` (AI SDK) + metadata dokumen (di-inject `documentStateBuilder` client). Tambahan body custom kita (via `chatRequestOptions.body`): `{ artifactId: string }` → untuk ownership + billing + (Model B) konteks.
- **Respons:** `result.toUIMessageStreamResponse()` → `new Response(stream, { headers })` (Elysia mengembalikan `Response` apa adanya).
- **Error:** structured `appError` (`packages/db/src/appError.ts`) untuk auth/billing block; bentuk yang dimengerti client (atau stream error part).

### 3.2 Billing
- Event baru `doc_ai_edit` di plan/entitlement (`packages/services` plan SSOT).
- Pola: **precheck non-consuming** dulu (gate), lalu `consumeCredits` idempotent (key = `artifactId:turnId` atau requestId) saat stream sukses (`onFinish`).
- Tier efektif Lite (model A pakai model Lite). ⚠️ Owner tentukan harga.

### 3.3 AIExtension (client)
```ts
AIExtension({
  transport: new DefaultChatTransport({
    api: `${API_URL}/blocknote-ai/chat`,
    body: { artifactId },          // dikirim tiap request → ownership/billing/context
    credentials: "include",        // Clerk cookie/session
  }) as any,                       // 1 cast: skew ai@6↔ai@7-beta (lihat §7)
})
```

### 3.4 `invokeAI` (bridge panel Astra)
```ts
const ai = editorRef.getExtension(AIExtension);
if (!ai) return;                   // getExtension → Instance | undefined
await ai.invokeAI({ userPrompt, useSelection: true });
```

---

## 4. Fase 0 — Dependencies & pinning

**Hasil:** dependency xl-ai terpasang, versi BlockNote selaras, build/typecheck hijau (tanpa fitur baru dulu).

Langkah:
1. `apps/web/package.json` — set **exact** `@blocknote/core` `0.51.4`, `@blocknote/react` `0.51.4`, `@blocknote/shadcn` `0.51.4`; tambah `@blocknote/xl-ai` `0.51.4`.
2. `apps/api/package.json` — tambah `ai` `^6` + `@ai-sdk/openai` `^2` (provider ai@6) + `@blocknote/xl-ai` `0.51.4` (untuk subpath `/server`; tidak menarik UI).
3. `bun install` (root). Verifikasi: web resolve `@blocknote/core@0.51.4` tunggal di graph-nya; `@blocknote/xl-ai/server` resolve di api.
4. `bun run typecheck` + `bun run build` hijau (belum ada wiring baru).

**Acceptance:** install bersih, gates hijau, tidak ada dua copy `@blocknote/core` di graph web. (Lihat PoC `xlai-poc` sebagai referensi.)

---

## 5. Fase 1 — Backend route (titik colok Astra)

**Hasil:** endpoint `POST /blocknote-ai/chat` di `apps/api` yang men-stream edit dokumen dari model Astra, ber-auth + ber-billing.

File & langkah:
1. **`packages/services`** — `DocAiService` (atau perluas `ArtifactService`):
   - Fungsi membangun model + tools + systemPrompt untuk route (agar logika domain tetap di services, route tipis). Reuse env gateway yang sama dengan agent (`OPENAI_BASE_URL`/`OPENAI_API_KEY`/`AQSHA_LITE_MODEL`).
   - **CATATAN versi:** services build ke `dist` (tsup) dan diimpor api + agent. `@blocknote/xl-ai/server` (ai@6) di services bisa bentrok dengan agent (ai@7-beta) **bila** services jadi satu bundle. **Mitigasi:** taруh kode xl-ai/server **langsung di `apps/api`** (bukan di `packages/services`) agar ai@6 terkurung di api; services hanya menyediakan helper murni (build prompt Indonesia/brand, ownership check, billing) tanpa import `ai`.
2. **`apps/api/src/routes/blocknote-ai.ts`** (baru):
   - `POST /blocknote-ai/chat`. Auth Clerk → `ownerUserId`.
   - Baca `artifactId` dari body; `ArtifactService.assertOwner` / cek artifact milik user.
   - Billing precheck (gate) → bila block, balas structured error (return-union).
   - Bangun:
     ```ts
     import { createOpenAI } from "@ai-sdk/openai";       // ai@6 provider
     import { convertToModelMessages, streamText } from "ai"; // ai@6
     import { aiDocumentFormats, injectDocumentStateMessages, toolDefinitionsToToolSet } from "@blocknote/xl-ai/server";
     const astra = createOpenAI({ baseURL: OPENAI_BASE_URL, apiKey: OPENAI_API_KEY });
     const fmt = aiDocumentFormats.html;
     const result = streamText({
       model: astra.chat(AQSHA_LITE_MODEL),
       system: `${INDO_BRAND_PROMPT}\n\n${fmt.systemPrompt}`,
       messages: injectDocumentStateMessages(convertToModelMessages(messages)),
       tools: toolDefinitionsToToolSet(/* tool definitions dari fmt */),
       onFinish: () => { /* consumeCredits idempotent */ },
     });
     return result.toUIMessageStreamResponse();
     ```
     > Signature exact (`injectDocumentStateMessages(messages: UIMessage[]): UIMessage[]`, `toolDefinitionsToToolSet(toolDefinitions): ToolSet`) diverifikasi di types 0.51.4; sumber `ToolDefinitions` = dari format html stream tools (cek `aiDocumentFormats.html` + `streamTool` types saat impl).
3. **`apps/api/src/server.ts`** (atau router) — daftarkan route. Pastikan streaming `Response` lolos Elysia tanpa di-buffer.
4. **Env** — pastikan `apps/api/.env` punya `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`AQSHA_LITE_MODEL`. (Owner sync VPS env.)
5. **`INDO_BRAND_PROMPT`** — instruksi singkat: balas/tulis Bahasa Indonesia, hormati brand voice, jangan keluar dari format operasi blok.

**Acceptance Fase 1:**
- `curl`/test: POST dengan UIMessage + artifactId milik user → stream tool-call valid; non-owner → 403 structured; billing block → return-union.
- `bun run typecheck` (api) hijau; ai@6 terkurung di api (agent/web tak terdampak).

---

## 6. Fase 2 — Editor native AI (in-editor trigger)

**Hasil:** editor artifact mendapat AI native shadcn (slash `/ai`, tombol toolbar AI, AI menu, diff Accept/Reject), terhubung ke route Fase 1.

File & langkah (`apps/web/features/workspaces/components/blocknote-document-editor.tsx`):
1. Buat editor dengan extension AI:
   ```ts
   const editor = useCreateBlockNote({
     dictionary: { ...en, ai: aiEn },
     extensions: [AIExtension({ transport })],
     initialContent,
   }, [transport]);
   ```
2. Mount UI AI di `<BlockNoteView>` (shadcn):
   - `<AIMenuController />`
   - `FormattingToolbarController` → `FormattingToolbar` + `getFormattingToolbarItems()` + `<AIToolbarButton />` (gantikan tombol "Tanya Astra" custom; lihat §8 keputusan apakah simpan "tanya" mode).
   - `SuggestionMenuController` slash → gabung default + `getAISlashMenuItems(editor)`.
3. Import `@blocknote/xl-ai/style.css` (sekali, global atau di komponen).
4. **Autosave aman:** xl-ai apply diff ke `editor.document`. `useEditorChange` → autosave existing tetap; saat **menulis-AI** (state `ai-writing`/`user-reviewing`) **pause autosave** agar konten review-belum-accept tidak ter-persist. Resume + serialize setelah `acceptChanges`; revert bersih setelah `rejectChanges`. (Observasi state via `editor.getExtension(AIExtension).store`.)
5. Selaras style: pastikan diff/agent-cursor xl-ai cocok tema `aqsha-blocknote` (CSS tweak override bila perlu).

**Acceptance Fase 2:**
- Editor terbuka → `/ai` + tombol toolbar AI muncul; "ringkas paragraf ini" → diff streaming + Accept/Reject native; Accept mengubah dokumen & tersimpan; Reject mengembalikan utuh.
- Konten review-belum-accept **tidak** ter-persist (cek `artifact_contents` tak berubah sampai Accept).
- Render UI AI benar di shadcn (bukan mantine).

---

## 7. Fase 3 — Trigger dari panel Astra (`invokeAI` bridge)

**Hasil:** panel chat Astra (di reader shell) bisa memicu edit dokumen terbuka.

File & langkah:
1. **Expose editor instance** dari `blocknote-document-editor.tsx` ke shell (`forwardRef` atau callback `onEditorReady(editor)`), simpan di `artifact-reader-page-shell.tsx`. (Saat ini editor internal-only.)
2. **Bridge user-driven:** di composer/panel, ketika user mengirim instruksi yang menyasar dokumen terbuka (mis. ada selection pill / mode "edit"), panggil `editorRef.getExtension(AIExtension).invokeAI({ userPrompt, useSelection })` alih-alih (atau selain) kirim ke agent chat.
3. **Reuse selection→pill** (kategori B): ContextRef `artifact-selection` + tombol selection → boleh memfeed `userPrompt`/selection ke `invokeAI`. Mode "tanya tentang bagian ini" (baca) tetap lewat chat; mode "edit bagian ini" lewat `invokeAI`.
4. UX: indikator saat AI menulis (state machine) + fokus ke editor saat invoke.

**Acceptance Fase 3:**
- Dari panel Astra, minta "perbaiki paragraf terpilih" → diff muncul di editor → Accept/Reject.
- Selection di editor → aksi "edit dengan Astra" → `invokeAI` dengan konteks blok benar.

### 7.1 (Opsional D8) Fase 3.5 — agent-driven edit signal
- Tool `request_document_edit(artifactId, instruction)` (TANPA write DB) → output dideteksi `use-mastra-agent.onChunk` → bila editor artifact terbuka, panggil `invokeAI`; bila tertutup, tampilkan affordance "buka dokumen untuk menerapkan".

---

## 8. Fase 4 — Replace-total cleanup

**Hasil:** seluruh tumpukan custom-overlay + `propose_document_edit` dihapus; gates hijau; migrasi rapi.

Berdasarkan audit (research doc §4). **HAPUS (kategori A):**

**DB**
- `packages/db/src/schema/artifactEditSuggestions.ts` (hapus file).
- `packages/db/src/repositories/artifactEditSuggestionRepo.ts` (hapus file).
- Baris barrel `packages/db/src/schema/index.ts:8` + `repositories/index.ts:8`.
- **Migrasi:** ⚠️ tergantung state:
  - **Bila 0021 BELUM di-apply ke DB manapun** (custom-overlay belum pernah `db:migrate`): hapus `migrations/0021_fat_bulldozer.sql` + `meta/0021_snapshot.json` + revert entri `meta/_journal.json` → seolah tak pernah ada.
  - **Bila SUDAH di-apply** (dev :5432 dan/atau prod :5435): `bun run db:generate` setelah schema dihapus → migrasi **0022** `DROP TABLE IF EXISTS artifact_edit_suggestions` (+ enum). Owner `db:migrate` dev+prod (pola memory `explore-pr51-merge`; full-restart sesudahnya).

**Services**
- `packages/services/src/suggestion.service.ts` (hapus file) + ekspornya di `index.ts:97-103`.
- `context.service.ts` — selection branch: **simpan** struktur (kategori B), tapi ubah instruksi `buildNote` (`:264-275`) dari "pakai `propose_document_edit`" → "untuk mengedit, gunakan AI editor (Astra dapat mengedit bagian terpilih)". Jangan rujuk tool yang sudah dihapus.

**API**
- `apps/api/src/routes/artifacts.ts:140-182` — hapus 3 route suggestion (suggestion-counts, suggestions GET, resolve POST) + `pendingSuggestionCount` di detail/list.

**Agent**
- `apps/agent/src/mastra/tools/propose-document-edit.ts` (hapus file).
- `tools/index.ts:32` — hapus registrasi.
- `instructions.ts:45-52` (blok "Mengedit dokumen") + `:21` (daftar tool) + pointer di `context.service.ts` — hapus/reword.

**FE — overlay & kartu**
- `artifact-suggestion-review.tsx` (hapus file).
- `chat-suggestion-card.tsx` (hapus file) — ⚠️ atau sisakan versi ringan "diedit di dokumen" (kategori C); default v1 **hapus**.
- `SuggestionBadge` di `artifact-detail-view.tsx:697-704` + render `:237-238`.
- Timeline suggestion: `timeline-types.ts:83-98` (`SuggestionCardModel` + `{kind:"suggestion"}`), `mastra-timeline.ts:389-391/968-982/1040-1059` (`suggestionFromResult`/`replaceWithSuggestion`/dispatch), `message-list.tsx:181/250-252`.

**FE — hooks/keys/props**
- `features/artifacts/api.ts:232-274` (`useArtifactSuggestions`/`useResolveSuggestion`/`useArtifactSuggestionCounts`).
- `features/artifacts/types.ts:55-77` (`EditOpView`/`EditSuggestionView`/`ResolveSuggestionStatus`).
- `lib/api-query.ts:29-30` (`queryKeys.artifacts.suggestions`/`suggestionCounts`).
- `use-mastra-agent.ts:224-237` (invalidation `propose_document_edit`).
- `workspace-library-grid.tsx:101/146/305` (badge counts).
- `blocknote-aqsha.css` `.aqsha-suggestion-target`.
- Props `pendingSuggestions/onResolveSuggestion/resolvingSuggestion` di `blocknote-document-editor.tsx` + `artifact-detail-view.tsx`.

**SIMPAN/REWIRE (kategori B — jangan hapus):**
- Pipeline select→pill→konteks (`artifact-selection` ContextRef di `chat-core` + composer chip + `context.service` selections + `/threads/context/hydrate`) — untuk "tanya/edit bagian ini".
- Tombol selection + `EditorSelection` — rewire callback → `invokeAI` (Fase 3).
- Plumbing instance editor (`useCreateBlockNote`) — rewire dengan AIExtension + expose ref.
- Jalur autosave (`useEditorChange`→`onContentChange`→`useUpdateDocument`→`PUT /artifacts/:id/document`) — persistensi setelah Accept.
- `get_render_payload`/`getRenderPayload`, mention markers, `ArtifactRenderPayload`, queryKeys detail/render.

**Acceptance Fase 4:**
- `grep` kode untuk `propose_document_edit`/`suggestion`/`artifactEditSuggestion` → tidak ada sisa (kecuali kategori B yang sengaja disimpan).
- `bun run typecheck` + `bun run lint` + `bun run test` hijau (web+api+agent+services+db).
- Migrasi konsisten; owner `db:migrate` bila perlu (0022 drop).
- dist `@aqsha/db`/`@aqsha/services` rebuilt.

---

## 9. Fase 5 — (opsional) Model B: konteks Astra di route

Tanpa ubah client. Di route, sebelum `streamText`, perkaya `system`/`messages`:
- Ambil ringkasan thread / @mention paper-berita (reuse `context.service`).
- RAG `search_thread_documents` untuk konteks artifact lain.
- **Jangan** jalankan agent chat penuh (system prompt + tool-nya bentrok dengan protokol operasi xl-ai). Hanya enrich prompt + tetap pakai stream tools xl-ai.

---

## 10. i18n & brand
- `INDO_BRAND_PROMPT` di-prepend ke `aiDocumentFormats.html.systemPrompt`.
- `aiEn` dari `@blocknote/xl-ai/locales` untuk dictionary AI menu (cek ketersediaan locale `id`; bila tak ada, override label menu via dictionary atau custom AI menu items).
- Copy UI: sentence case, tanpa all-caps (memory `copywriting-no-uppercase`).

---

## 11. Testing plan
- **Service (runner `packages/services`):** helper build-prompt/ownership/billing-gate untuk route (yang murni, tanpa `ai`).
- **API (runner `apps/api`):** route auth (403 non-owner), billing block return-union, happy-path stream shape (mock model). Pastikan tak meng-import `ai@7-beta`.
- **FE typecheck/lint:** editor + AI UI + `invokeAI` bridge (referensi PoC hijau).
- **E2E (owner, Clerk + creds gateway):**
  - in-editor: `/ai`, tombol toolbar, AI menu → diff → Accept/Reject → tersimpan.
  - panel Astra: `invokeAI` dari selection → diff → Accept.
  - pause-autosave: review-belum-accept tak ter-persist.
  - billing: kuota habis → block; sukses → debit sekali (idempotent).

---

## 12. Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| Dua copy `@blocknote/core` (caret) → type error | **Pin exact** keempat paket (D2); cek graph web sesudah install. |
| `ai@6` (xl-ai/server) bocor ke `ai@7-beta` (agent/services) | Kurung xl-ai/server **hanya di `apps/api`**; services tetap tanpa import `ai` (§5.1). |
| `transport` type skew ai@6↔ai@7-beta (web) | 1 cast `as any` di titik transport (terdokumentasi); atau alias `ai@6` di web. |
| Konten review-belum-accept ter-persist (korup dokumen) | **Pause autosave** saat `ai-writing`/`user-reviewing`; serialize hanya setelah Accept (§6.4). |
| Billing bypass (edit native "gratis") | Gate + `consumeCredits` di route (D7); idempotent. |
| Durabilitas hilang mengejutkan user | Keputusan sadar D6; affordance "buka dokumen"; owner konfirmasi. |
| Migrasi 0021 collision | Tangani per-state (§8 migrasi); full-restart sesudah `db:migrate`. |
| Streaming `Response` ke-buffer Elysia | Verifikasi `toUIMessageStreamResponse()` lolos apa adanya; uji SSE. |
| Locale `id` AI menu tak ada | Override dictionary / custom AI menu items (§10). |

---

## 13. Urutan eksekusi (checklist)

- [ ] **Fase 0** — pin exact `@blocknote/*` `0.51.4` + add `@blocknote/xl-ai` (web) & `ai@6`+`@ai-sdk/openai@2`+`xl-ai` (api); `bun install`; gates hijau.
- [ ] **Fase 1** — route `apps/api/.../blocknote-ai.ts` (auth+billing+streamText→Astra+Indo/brand prompt); test api.
- [ ] **Fase 2** — rewire `blocknote-document-editor.tsx` (AIExtension + AI UI shadcn + transport→route + pause-autosave); E2E in-editor.
- [ ] **Fase 3** — expose editor ref + `invokeAI` bridge dari panel; rewire selection callback; E2E panel.
- [ ] **Fase 4** — hapus seluruh kategori (A); migrasi drop (per-state); gates hijau; dist rebuilt.
- [ ] **Fase 3.5** (opsional D8) — `request_document_edit` signal tool + bridge.
- [ ] **Fase 5** (opsional D5/B) — enrich konteks Astra di route.
- [ ] Owner: `db:migrate` (dev :5432 + prod :5435) bila 0022; sync VPS env; E2E penuh.

---

## 14. Manifest file (ringkas)

**Baru:** `apps/api/src/routes/blocknote-ai.ts`; (opsional) helper di `packages/services` (prompt/ownership/billing, tanpa `ai`); (opsional) `apps/agent/.../tools/request-document-edit.ts`.

**Diubah (rewire):** `apps/web/.../blocknote-document-editor.tsx`, `artifact-detail-view.tsx`, `artifact-reader-page-shell.tsx`; `apps/api/.../artifacts.ts` (buang route suggestion) + `server.ts` (daftar route); `apps/web/package.json` + `apps/api/package.json`; `packages/services/.../context.service.ts` (reword), `index.ts`; `apps/agent/.../instructions.ts`, `tools/index.ts`; `packages/db/src/schema/index.ts`, `repositories/index.ts`; `apps/web/.../message-list.tsx`, `mastra-timeline.ts`, `timeline-types.ts`, `use-mastra-agent.ts`, `features/artifacts/{api,types}.ts`, `lib/api-query.ts`, `workspace-library-grid.tsx`, `app/styles/blocknote-aqsha.css`.

**Dihapus:** `packages/db/src/schema/artifactEditSuggestions.ts`, `repositories/artifactEditSuggestionRepo.ts`; `packages/services/src/suggestion.service.ts` (+ test); `apps/agent/.../tools/propose-document-edit.ts`; `apps/web/.../artifact-suggestion-review.tsx`, `chat-suggestion-card.tsx`; migrasi `0021*` (atau ganti dengan 0022 drop).

---

## 15. Referensi
- Riset + PoC: `docs/blocknote-native-ai-astra-research.md` (§6.1 hasil PoC, §4 peta delete/keep).
- PoC live: worktree `../aqsha-blocknote-xlai-poc` (branch `xlai-poc`), `apps/web/app/blocknote-ai-poc/page.tsx` (typecheck hijau).
- Model Astra: `apps/agent/src/mastra/model.ts`. Billing: `packages/services/src/billing.service.ts:245`. Audit kode lama: research doc §4 + lampiran.
</content>
