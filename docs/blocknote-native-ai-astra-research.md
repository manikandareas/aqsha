# Riset: AI Native BlockNote (`@blocknote/xl-ai`) digerakkan oleh Astra

> Status: **RESEARCH** — belum koding produksi. Dibuat 2026-06-30.
> Bahasa: Indonesia (istilah teknis tetap English), sesuai `CLAUDE.md`.
> Arah disepakati owner: **replace total** jalur custom-overlay + `propose_document_edit`, dan riset **sampai PoC kecil** yang membuktikan model provider xl-ai bisa diarahkan ke Astra.

---

## 0. TL;DR + Rekomendasi

**Bisa, dan justru lebih natural daripada jalur sekarang.** xl-ai 0.51.x **bukan** lagi mesin yang "memanggil LLM sendiri di browser tanpa titik injeksi" (asumsi spike lama yang menolaknya). Arsitekturnya sekarang **transport-based**: editor mengirim request ke **backend route milik kita**, dan route itulah yang menjalankan `streamText({ model })`. **`model:` di route itu = satu-satunya titik colok Astra.** Kita arahkan ke gateway OpenAI-compatible yang sama dengan yang dipakai Astra (`OPENAI_BASE_URL` + `AQSHA_LITE_MODEL`).

Tiga blocker yang dulu disebut spike lama **gugur** setelah verifikasi:

| Klaim spike lama (§8.1 plan) | Realita 2026-06-30 |
|---|---|
| "Tak ada API untuk mendorong operasi eksternal tanpa LLM-call" | **Salah pertanyaan.** Arah baru kita justru *memakai* LLM-call native xl-ai, dengan model = Astra. Titik colok resmi & terdokumentasi (`transport` → backend route). |
| "Butuh `@blocknote/mantine` (editor kita `@blocknote/shadcn`)" | **Salah.** `grep @blocknote/mantine` di `dist` xl-ai = **0 match**. Dependency itu phantom; komponen AI render via `useComponentsContext()` → **kompatibel dengan shadcn**. |
| "Butuh `@tiptap/core` v3 (konflik)" | **Tidak konflik.** `@blocknote/core@0.51.1` sudah memakai `@tiptap/core ^3.13.0` — identik dengan kebutuhan xl-ai. |
| "Salinan kedua `ai` v6" | **Benar, tapi terisolasi.** Client xl-ai bawa `ai@6` hanya untuk protokol transport (fetch/SSE). Server route + app kita tetап `ai@7-beta`. Skew tak saling sentuh (lihat §6). |

**Rekomendasi:** ya, ganti total ke xl-ai native, **dengan arsitektur backend-route yang kita kontrol**. Mulai dari **Model A** (native engine + model Astra mentah lewat custom route, plus auth + billing), desain route-nya agar **bisa di-upgrade ke Model B** (route memperkaya prompt dengan konteks Astra/RAG) tanpa mengubah client. Trigger ganda (in-editor native + dari panel Astra) didukung native lewat `invokeAI()`.

**Konsekuensi yang harus disadari:** xl-ai melewati Mastra Memory, billing processor, dan konteks agent. Tiga hal itu **pindah ke backend route** kita (auth Clerk + `BillingService.consumeCredits` + opsional enrich konteks). Ini bukan blocker, tapi pekerjaan nyata (§8).

---

## 1. Arsitektur `@blocknote/xl-ai` 0.51.x (terverifikasi dari types tarball + docs)

### 1.1 Aliran request (transport → server → diff)

```
[Editor]  AIExtension({ transport })
   │  user: slash /ai, tombol toolbar AI, atau invokeAI() programatik
   │  documentStateBuilder → serialize blok (default format: HTML)
   ▼
[transport: DefaultChatTransport({ api: "/blocknote-ai/chat" })]
   │  POST UIMessage[] (AI SDK protocol) ke BACKEND KITA
   ▼
[BACKEND ROUTE  ← TITIK COLOK ASTRA]
   │  injectDocumentStateMessages(convertToModelMessages(messages), …)
   │  streamText({ model: <ASTRA GATEWAY>, tools: toolDefinitionsToToolSet(streamTools) })
   │  → .toUIMessageStreamResponse()
   ▼
[Editor parse stream → apply sebagai SUGGESTION/DIFF]
   state machine: user-input → thinking → ai-writing → user-reviewing
   blok berubah live (agent cursor), highlight insert/delete, Accept/Reject native
```

Sumber: docs `blocknotejs.org/docs/features/ai/{getting-started,backend-integration,reference}` + `package/types/src/{AIExtension,types,server,api/*}.d.ts` dari `@blocknote/xl-ai@0.51.1`.

### 1.2 API extension (programmatic — fondasi trigger dari panel Astra)

`AIExtensionInstance` (dari `AIExtension.d.ts`) mengekspos:

```ts
invokeAI(opts: InvokeAIOptions): Promise<void>   // trigger edit (callLLM = alias deprecated)
openAIMenuAtBlock(blockID: string): void          // buka AI menu di blok tertentu
closeAIMenu(): void
acceptChanges(): void                             // terima diff (native review)
rejectChanges(): void                             // tolak diff
abort(reason?): Promise<void>                      // batalkan + revert
retry(): Promise<void>                             // ulang saat status "error"
get store(): Store<AIPluginState>                  // observasi state machine
```

`InvokeAIOptions`:
```ts
type InvokeAIOptions = {
  userPrompt: string;                 // instruksi
  useSelection?: boolean;             // default true → operasi pada selection editor
  deleteEmptyCursorBlock?: boolean;   // default true
} & AIRequestHelpers;                 // bisa override transport/streamTools per-call
```

> **Inilah yang membuat "trigger dari panel Astra" trivial:** panel chat memegang ref editor → `editor.getExtension(AIExtension).invokeAI({ userPrompt, useSelection: true })`. Edit lalu mengalir lewat route yang sama dan dirender sebagai diff native.

### 1.3 Format dokumen & stream tools

`aiDocumentFormats` (dari `api/formats/formats.d.ts`):
- **`html`** — **default & stabil**. LLM melihat dokumen sebagai HTML blok, mengeluarkan operasi blok.
- `_experimental_json`, `_experimental_markdown` — eksperimental.

Setiap format menyediakan **3 stream tool** yang dipanggil model dan diterapkan inkremental oleh editor:
- `add` (`createAddBlocksTool`) — sisip blok
- `update` (`createUpdateBlockTool`) — ganti isi blok (hormati selection range)
- `delete` — hapus blok

> Catatan storage: artifact kita disimpan sebagai `blocksJson` + `markdown` + `plainText`. **Tidak perlu berubah.** xl-ai bekerja di level blok (lewat representasi HTML untuk LLM); markdown tetap hasil serialisasi. Autosave existing (`useEditorChange → PUT /artifacts/:id/document`) tetap jadi mekanisme persistensi setelah Accept.

### 1.4 Komponen UI native (yang bikin "terasa alami")

Dirender di dalam `<BlockNoteView>` (kompatibel shadcn):
- `AIMenuController` + `getDefaultAIMenuItems` — menu AI Notion-like (Continue writing, Summarize, Fix spelling, Improve writing, Translate, dst.).
- `getAISlashMenuItems` — item slash `/ai`.
- `AIToolbarButton` / `FormattingToolbarWithAI` — tombol AI di formatting toolbar.
- `SuggestionMenuWithAI` — slash menu yang sudah memuat AI.

Inilah pengganti "Tanya Astra" tombol custom + overlay review buatan tangan kita: review Accept/Reject menjadi **bagian native dari engine** (state `user-reviewing`), bukan floating card yang mengukur rect blok.

---

## 2. Titik integrasi Astra — backend route

### 2.1 Kontrak server (dari `@blocknote/xl-ai/server`)

Subpath `./server` mengekspor (dari `server.d.ts` → `api/index.js`):
- `aiDocumentFormats` (html/json/markdown), `DocumentStateBuilder`
- helper request: `buildAIRequest`, `sendMessageWithAIRequest`
- `promptHelpers`: `trimEmptyBlocks`, `convertBlocks`, `suffixIds`, `flattenBlocks`, `addCursorPosition`
- base-tools: `createAddBlocksTool`, `createUpdateBlockTool`, `delete`
- `_getApplySuggestionsTr` (low-level, advanced — **tidak** kita pakai)

> `@blocknote/xl-ai-server@0.51.1` **tidak ada** sebagai package (ETARGET). Server helpers cukup dari subpath `@blocknote/xl-ai/server`.

### 2.2 Bentuk route (sketsa, dari docs `backend-integration`)

```ts
// streamText + tools dari xl-ai/server. model = colokan Astra.
import { createOpenAI } from "@ai-sdk/openai";              // versi yang cocok ai@6 (lihat §6)
import { convertToModelMessages, streamText } from "ai";    // ai@6 (cocok dengan xl-ai/server)
import {
  aiDocumentFormats,
  injectDocumentStateMessages,
  toolDefinitionsToToolSet,
} from "@blocknote/xl-ai/server";

const astra = createOpenAI({
  baseURL: process.env.OPENAI_BASE_URL,   // gateway yang SAMA dengan apps/agent/model.ts
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handleBlockNoteAI(req: Request) {
  // 1) auth Clerk → ownerUserId  (lihat §8.1)
  // 2) billing precheck/gate     (lihat §8.2)
  const { messages } = await req.json();
  const format = aiDocumentFormats.html;

  const result = streamText({
    model: astra.chat(process.env.AQSHA_LITE_MODEL ?? "gpt-4o"),  // ← ASTRA
    messages: injectDocumentStateMessages(convertToModelMessages(messages) /*, …*/),
    tools: toolDefinitionsToToolSet(/* format.getStreamTools(...) */),
    // system: format.systemPrompt  (+ enrich konteks Astra di Model B)
  });
  // 3) onFinish → debit credits
  return result.toUIMessageStreamResponse();
}
```

### 2.3 Dua model integrasi (mulai A, desain agar bisa ke B)

**Model A — Native engine + model Astra (REKOMENDASI v1).**
Route memanggil model gateway mentah. Cepat, "terasa native", cocok untuk edit in-editor ("perbaiki tulisan", "ringkas", "terjemahkan"). **Bukan** agent penuh — tanpa tool RAG/memory.

**Model B — Native engine + konteks/otak Astra (evolusi).**
Route yang sama, tapi sebelum `streamText` ia memperkaya `system`/messages dengan konteks Astra: ringkasan thread, @mention paper/berita, hasil RAG `search_thread_documents`. Karena format stream tool xl-ai menuntut output operasi-dokumen yang ketat, **jangan** jalankan agent chat penuh (system prompt + tool-nya bentrok dengan protokol operasi). Pola yang benar: **panggil services Astra untuk membangun konteks**, lalu `streamText` dengan stream tools xl-ai. Client tak berubah → upgrade A→B tanpa menyentuh editor.

> Kesimpulan desain: **route adalah batas Astra.** Taruh auth + billing + (nanti) enrich konteks di sini.

---

## 3. Desain trigger ganda

### 3.1 In-editor (native, gratis dari xl-ai)
- `/ai` slash menu, tombol AI di formatting toolbar, AI menu di blok.
- Selection-aware otomatis (`useSelection: true`).
- Review Accept/Reject native (state `user-reviewing`).

Ini langsung menggantikan tombol "Tanya Astra" + overlay custom.

### 3.2 Dari panel Astra (lewat `invokeAI`)
Bridge chat → editor (keduanya sudah satu React/QueryClient tree di `artifact-reader-page-shell.tsx`):

```
[Panel Astra]
  user/agent memutuskan "edit dokumen ini"
        │
        ▼
  editorRef.getExtension(AIExtension).invokeAI({
    userPrompt: <instruksi>,        // dari pesan user / hasil agent
    useSelection: <ada selection?>, // pakai blok terpilih bila ada
  })
        │  (jalan via route yang sama → model Astra)
        ▼
  diff native muncul di editor → user Accept/Reject
```

Dua varian trigger panel:
1. **User-driven:** user mengetik di composer "ringkas bab metode" sambil ada artifact terbuka → kita panggil `invokeAI` alih-alih (atau selain) mengirim ke agent chat.
2. **Agent-driven:** agent chat masih boleh memutускan "ini sebaiknya diedit"; alih-alih `propose_document_edit` (record durable), agent mengembalikan **sinyal** (tool kecil mis. `request_document_edit` tanpa write DB) yang dideteksi `use-mastra-agent.onChunk` → memanggil `invokeAI` di editor terbuka. Untuk editor tertutup, sinyal jadi affordance "buka dokumen untuk menerapkan saran".

> **Catatan penting durabilitas:** jalur sekarang *durable* (saran nунggu di DB walau editor tutup). xl-ai murni *in-editor* (diff hidup hanya saat editor terbuka). Jika produk butuh "saran menunggu lintas sesi", itu **hilang** di replace-total dan harus didesain ulang (lihat §7 ambiguous + §9 open questions).

---

## 4. Peta "replace total" — apa yang dihapus / disimpan / abu-abu

Hasil audit kode (lihat lampiran detail). Migrasi: `0021_fat_bulldozer.sql`.

### A) HAPUS (khusus durable-suggestion + overlay)
- **DB:** `schema/artifactEditSuggestions.ts`, `repositories/artifactEditSuggestionRepo.ts`, 2 baris barrel (`schema/index.ts:8`, `repositories/index.ts:8`), migrasi `0021` (+ migrasi drop baru).
- **Services:** seluruh `suggestion.service.ts`; ekspornya di `services/index.ts:97-103`.
- **API:** 3 route suggestion di `artifacts.ts:140-182` (suggestion-counts, suggestions, resolve).
- **Agent:** `tools/propose-document-edit.ts`; registrasi `tools/index.ts:32`; blok instruksi "Mengedit dokumen" `instructions.ts:45-52` (+ baris `:21` + pointer di `context.service.ts:268`).
- **FE overlay & kartu:** `artifact-suggestion-review.tsx` (overlay custom), `chat-suggestion-card.tsx`, `SuggestionBadge` (`artifact-detail-view.tsx:697-704` + render `:237-238`), timeline suggestion (`timeline-types.ts:83-98`, `mastra-timeline.ts:389-391/968-982/1040-1059`, `message-list.tsx:181/250-252`).
- **FE hooks/keys:** `useArtifactSuggestions`/`useResolveSuggestion`/`useArtifactSuggestionCounts` (`artifacts/api.ts:232-274`), `EditOpView`/`EditSuggestionView`/`ResolveSuggestionStatus` (`types.ts:55-77`), `queryKeys.artifacts.suggestions`/`suggestionCounts` (`api-query.ts:29-30`), invalidation `propose_document_edit` di `use-mastra-agent.ts:224-237`, badge library-grid (`workspace-library-grid.tsx:101/146/305`), CSS `.aqsha-suggestion-target`, props `pendingSuggestions/onResolveSuggestion/resolvingSuggestion`.

### B) SIMPAN / REWIRE (tetap dibutuhkan pendekatan native)
- **Pipeline select→pill→konteks** (`artifact-selection` ContextRef di `chat-core` + composer chip + `ContextService.buildNote` selections + `/threads/context/hydrate`). Tetap berguna untuk **"tanya Astra tentang bagian ini"** (mode chat), dan bisa memfeed `userPrompt`/selection ke `invokeAI`.
- **Tombol "Tanya Astra" + `EditorSelection`** (`blocknote-document-editor.tsx:29,131-162`) — rewire callback-nya ke `invokeAI` (atau pertahankan untuk mode tanya).
- **Plumbing instance editor:** `useCreateBlockNote` (`:55`) — sekarang internal-only; **harus di-rewire** agar dibuat dengan `extensions:[AIExtension(...)]` dan instance-nya di-share ke panel (untuk `invokeAI`).
- **Jalur konten/autosave:** `useEditorChange → onContentChange → useUpdateDocument → PUT /artifacts/:id/document`. **Tetap** sebagai persistensi setelah Accept. `get_render_payload`/`getRenderPayload` tetap (baca struktur blok).
- **chat-core mention markers, `ArtifactRenderPayload`, queryKeys detail/render** — generik, simpan.

### C) ABU-ABU (keputusan produk)
- **`EditOp` union** — kalau ingin audit-log/trace edit AI server-side, pertahankan; kalau xl-ai pegang seluruh siklus diff di client, ikut hapus.
- **Kartu chat "Astra usulkan N perubahan / Tinjau"** — di xl-ai edit terjadi di editor; kartu bisa hilang, atau disisakan versi ringan "diedit di dokumen".
- **Durabilitas saran lintas-sesi** — fitur yang HILANG di xl-ai murni. Bila produk masih mau, butuh desain ulang (mis. simpan "edit request" pending, bukan operasi blok).
- **Kemampuan agent chat memulai edit** — tanpa `propose_document_edit`, perlu bridge chat→editor `invokeAI` (§3.2 varian agent-driven).

---

## 5. Dependency & kompatibilitas (verified)

| Aspek | Temuan | Implikasi |
|---|---|---|
| `@blocknote/xl-ai` deps | `ai ^6.0.5`, `@ai-sdk/react ^3`, `@ai-sdk/provider-utils ^4.0.2`, `@tiptap/core ^3.13.0`, `@handlewithcare/prosemirror-suggest-changes`, `prosemirror-changeset`, `@blocknote/mantine` (phantom) + pin **exact** `@blocknote/core`/`react` | **PIN EXACT** `@blocknote/{core,react,shadcn,xl-ai}` ke versi sama (PoC: `0.51.4`). Caret `^0.51.1` → dua copy core → type error (lihat §6.1 #1). |
| `ai` app vs xl-ai | app `ai@7.0.0-beta.178`; xl-ai bawa `ai@6` | **Dua copy** di web. Client transport (`DefaultChatTransport`) harus dari `ai@6` (yang dibawa xl-ai). Backend route pakai `ai@6` + `@ai-sdk/openai` versi cocok agar selaras `xl-ai/server`. App `ai@7-beta` (Mastra/agent) tak tersentuh. |
| UI variant | `dist` xl-ai 0 import `@blocknote/mantine` | **shadcn OK.** |
| tiptap | core sudah `^3.13.0` | aligned. |
| Model Astra | `apps/agent/model.ts`: `createOpenAI({ baseURL, apiKey }).chat(AQSHA_LITE_MODEL)` (LanguageModelV4) | Route **tidak** import objek model agent (skew V4↔ai@6); ia **rekonstruksi** model ai@6 dari env gateway yang sama. Menghindari mismatch tipe sepenuhnya. |

**Risiko dependency utama** = resolusi dua versi `ai` di web + memastikan `@ai-sdk/openai` route cocok dengan `streamText` `ai@6`. Inilah yang PoC harus buktikan instalasi & build-nya (§6).

---

## 6. PoC kecil — rencana & kriteria sukses

**Pertanyaan PoC (yang menutup risiko nyata, bukan yang sudah jelas dari docs):**
1. **Install/resolve:** xl-ai `~0.51.1` + `ai@6` co-exist dengan app `ai@7-beta` di web tanpa pecah build/typecheck?
2. **shadcn render:** `<BlockNoteView>` (`@blocknote/shadcn`) + `AIExtension` + `AIMenuController`/`FormattingToolbarWithAI` mount & tampil benar?
3. **Astra drive:** backend route `streamText({ model: astraGateway })` + `xl-ai/server` tools menghasilkan stream yang di-parse client → diff native muncul?
4. **Programmatic:** `invokeAI({ userPrompt, useSelection })` dari luar UI editor men-trigger edit yang sama?

**Bentuk PoC (terisolasi, tidak mengotori branch `blocknote`):** worktree baru dari HEAD.
- `apps/web`: tambah `@blocknote/xl-ai` `~0.51.1`; halaman spike `/(dev)/blocknote-ai-poc` — editor `@blocknote/shadcn` + `AIExtension({ transport: DefaultChatTransport({ api }) })` + AI UI components + tombol "trigger via invokeAI".
- Backend route spike: Next.js route handler `apps/web/app/api/blocknote-ai/route.ts` (paling cepat untuk PoC; produksi bisa pindah ke Elysia/`apps/api`, lihat §8) yang `streamText` ke gateway (`OPENAI_BASE_URL`/`AQSHA_LITE_MODEL`).
- **Gate PoC:** `bun run typecheck` (web) hijau + `bun run build` web sukses → buktikan (1)&(2). Live LLM call (3)&(4) = owner jalankan dev + browser (butuh creds gateway + Clerk).

**Hasil PoC dicatat balik ke dokumen ini** (sukses/temuan) sebelum kunci rencana implementasi penuh.

> Catatan: titik colok model (3) secara arsitektur **sudah pasti** — `streamText({ model })` adalah API standar dan model Astra adalah AI-SDK model standar. PoC terutama membuktikan **integrasi instalasi (1,2)** dan **smoke trigger (4)**, bukan kelayakan konseptual.

### 6.1 Hasil PoC (2026-06-30) — **GATE HIJAU**

Dijalankan di worktree terisolasi `../aqsha-blocknote-xlai-poc` (branch `xlai-poc`), file PoC `apps/web/app/blocknote-ai-poc/page.tsx`.

| PoC | Hasil | Bukti |
|---|---|---|
| (1) Install/resolve | ✅ **PASS** | `bun install` exit 0; `@blocknote/xl-ai@0.51.4` + **tiga** copy `ai` co-exist (`ai@6.0.208`, `ai@6.0.216`, `ai@7.0.0-beta.178`) tanpa konflik; subpath `./server` resolve. |
| (2) shadcn + AI UI | ✅ **PASS** | `<BlockNoteView>` (`@blocknote/shadcn`) + `AIExtension` + `AIMenuController` + `AIToolbarButton` + `getAISlashMenuItems` **typecheck hijau** (`tsc --noEmit` web EXIT=0, 0 error). Konfirmasi: **bukan** butuh mantine. |
| (4) Trigger programatik | ✅ **PASS** | `editor.getExtension(AIExtension).invokeAI({ userPrompt, useSelection: true })` typecheck benar — instance ber-`invokeAI` (simulasi panel Astra). |
| (3) live model→diff | ⏳ owner | Perlu dev server + creds gateway + browser. Route `/api/blocknote-ai` (PoC: Next.js; produksi: Elysia `apps/api`). |

**Temuan baru kritikal dari PoC (wajib masuk implementasi):**

1. **Semua `@blocknote/*` HARUS pin versi PERSIS sama dengan xl-ai.** Awalnya `@blocknote/core/react/shadcn` di `^0.51.1` sementara `xl-ai ~0.51.1` menarik `0.51.4` (xl-ai pin core/react **exact**). Akibat: **dua copy `@blocknote/core`** → `BlockNoteEditor<0.51.1>` ≠ `<0.51.4>`, 6 type error (TS2344/2322/2769/2339/2345). **Fix:** pin `@blocknote/{core,react,shadcn,xl-ai}` ke `0.51.4` (exact) → turun ke 0 error. Saat upgrade BlockNote, **keempatnya naik bareng**.
2. **Batas tipe `transport` ai@6↔ai@7-beta butuh 1 cast di web.** `AIExtension({ transport })` mengetik `transport` thd `ChatTransport<UIMessage>` dari **ai@6** (xl-ai), sedang `DefaultChatTransport` web dari **ai@7-beta**. Runtime kompatibel (fetch/SSE); tipe perlu `as any` di satu titik. **Hilang** bila: (a) alias `ai@6` di web, atau (b) — lebih bersih — **route di `apps/api`** (lihat §8) sehingga web hanya butuh transport tanpa server-helper ai@6.
3. **`getExtension(AIExtension)` return `Instance | undefined`** → guard `if (!ai) return;` sebelum `invokeAI`.

> Kesimpulan PoC: **tidak ada blocker konseptual maupun integrasi.** Risiko nyata (dual-core-version, transport-type) teridentifikasi + ber-fix konkret. Worktree `xlai-poc` siap dipakai owner untuk verifikasi live (3): `bun dev` + buka `/blocknote-ai-poc`, isi `OPENAI_BASE_URL`/`OPENAI_API_KEY`/`AQSHA_LITE_MODEL` + tambah route `/api/blocknote-ai`.

---

## 7. Konsekuensi besar replace-total (harus disadari sebelum eksekusi)

xl-ai melewati runtime Mastra. Yang **pindah ke backend route**:

1. **Auth.** Route harus memverifikasi Clerk → `ownerUserId` + ownership artifact. (Pola `assertOwner` ada di services.)
2. **Billing.** Edit AI = pemakaian model → harus `BillingService.consumeCredits` (idempotent, sudah ada di `billing.service.ts:245`). Tanpa ini, edit in-editor "gratis" lewat gate plan. Perlu definisi **unit billing** untuk edit dokumen (mis. rate Lite per-invoke).
3. **Konteks/otak (Model B).** Edit native default = "model saja", tanpa RAG/@mention/memory. Bila ingin Astra "paham dokumen + thread", route harus memanggil services konteks (evolusi A→B).
4. **Durabilitas.** Saran lintas-sesi (editor tutup) hilang — keputusan produk (§9).
5. **Observability/trace.** Trace edit yang dulu lewat record DB → kalau perlu, log di route.

---

## 8. Penempatan backend route (produksi)

| Opsi | Pro | Kontra |
|---|---|---|
| **Next.js route di `apps/web`** | tercepat, co-located client, web sudah punya Clerk | web "pure consumer" — billing/services tak boleh di sini; harus call `apps/api` untuk debit; tambah `ai@6`+`xl-ai/server` ke web |
| **Elysia route di `apps/api`** (REKOMENDASI produksi) | rumah billing/entitlement/auth; structured error; web tetap konsumen via Eden | tambah `ai@6`+`@ai-sdk/openai`+`xl-ai/server` ke api; perlu return streaming `Response` dari Elysia (`result.toUIMessageStreamResponse()` → `new Response(stream)`) |
| `apps/agent` (Mastra) | dekat model | konflik versi `ai@7-beta` (agent) vs `ai@6` (xl-ai/server) dalam satu app — paling buruk |

PoC pakai Next.js route (cepat). Produksi: **Elysia di `apps/api`** (billing + auth ada di sana), client `DefaultChatTransport({ api: \`${API_URL}/blocknote-ai/chat\` })`.

---

## 9. Open questions (perlu keputusan owner)

1. **Durabilitas saran lintas-sesi** masih dibutuhkan? (xl-ai murni in-editor.) Bila ya → desain "edit request pending" terpisah.
2. **Billing unit** untuk edit dokumen: rate per-invoke (Lite)? gratis untuk tier tertentu? gate plan?
3. **Model A dulu, B kemudian** — setuju? Atau langsung wajib konteks Astra (RAG/@mention) di v1?
4. **Agent chat boleh memulai edit?** (varian agent-driven §3.2) atau cukup in-editor + user-driven invoke dari panel?
5. **Bahasa/format** — pastikan `systemPrompt` format html xl-ai bisa di-augment instruksi Bahasa Indonesia + brand voice (BRAND-IDENTITY).

---

## 10. Urutan eksekusi disarankan (bila lampu hijau)

1. **PoC kecil** (§6) di worktree → catat hasil di §6.
2. **Fase 1 — Native in-editor (Model A):** install xl-ai; rewire `blocknote-document-editor.tsx` (AIExtension + AI UI); backend route (Next.js PoC → pindah Elysia) dengan auth + billing; hapus tombol "Tanya Astra" lama bila digantikan native (atau pertahankan untuk mode tanya).
3. **Fase 2 — Trigger panel Astra:** share editor instance ke panel; `invokeAI` user-driven; (opsional) sinyal agent-driven.
4. **Fase 3 — Replace-total cleanup:** hapus semua kategori (A); migrasi drop `artifact_edit_suggestions`; rapikan instruksi agent; pastikan gates hijau.
5. **Fase 4 — Model B (opsional):** enrich konteks Astra di route (RAG/@mention/memory).

---

## Lampiran — referensi file integrasi sekarang (untuk eksekusi cleanup)

Lihat klasifikasi A/B/C di §4. Anchor utama:
- Agent tool: `apps/agent/src/mastra/tools/propose-document-edit.ts`, `tools/index.ts:32`, `instructions.ts:45-52`.
- Services: `packages/services/src/suggestion.service.ts`, `context.service.ts` (selection branch), `index.ts:97-103`.
- DB: `packages/db/src/schema/artifactEditSuggestions.ts`, `repositories/artifactEditSuggestionRepo.ts`, migrasi `0021`.
- API: `apps/api/src/routes/artifacts.ts:140-182`, `threads.ts:43-76`.
- FE: `artifact-suggestion-review.tsx`, `chat-suggestion-card.tsx`, `blocknote-document-editor.tsx`, `artifact-detail-view.tsx`, `artifact-reader-page-shell.tsx`, `features/artifacts/{api,types}.ts`, `lib/api-query.ts`, `use-mastra-agent.ts`, `mastra-timeline.ts`, `timeline-types.ts`, `composer-inline-editor.ts`, `workspace-library-grid.tsx`, `app/styles/blocknote-aqsha.css`.
</content>
</invoke>
