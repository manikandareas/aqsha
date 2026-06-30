# Rencana: Integrasi Panel Thread × BlockNote Editor (Artifact Markdown)

> Status: **PLAN** — belum koding. Dibuat 2026-06-29.
> Bahasa: Indonesia (istilah teknis tetap English), sesuai `CLAUDE.md`.

## 1. Tujuan

Mengintegrasikan panel chat Astra dengan editor BlockNote pada artifact markdown, dengan tiga kemampuan:

1. **Select → context token.** Saat user memilih block / teks di editor, muncul tombol di Formatting Toolbar ("Tanya Astra") yang menyemat pilihan itu sebagai **context token** (pill) di composer.
2. **Agent membaca** seluruh artifact dan block tertentu.
3. **Agent mengusulkan edit** (block tertentu atau seluruh dokumen). Usulan **tidak** langsung mengubah dokumen — ditampilkan sebagai **inline diff terhighlight** di editor (meminjam primitive `@blocknote/xl-ai`) dengan **Accept / Reject**. Usulan bersifat **durable**: tersimpan dan menunggu di artifact walau editor sedang tertutup; user diberi tahu lewat **kartu aksi deterministik di chat** + **badge di artifact**.

## 2. Keputusan terkunci (hasil diskusi owner)

| # | Keputusan |
|---|-----------|
| Trigger | Tombol di **Formatting Toolbar** BlockNote (bukan auto-embed / floating). |
| Approval | **Inline di editor** — usulan muncul terhighlight di bawah block konteks, dengan Accept/Reject. Bukan kartu approval Mastra di chat. |
| Render diff | **Pinjam primitive `@blocknote/xl-ai`** untuk visual diff/suggestion (bukan overlay custom dari nol). |
| Kontaminasi editor | **Boleh** mengkontaminasi `editor.document` saat preview demi UX bagus — **DENGAN syarat keras**: isi artifact yang **dipersist** tidak berubah sampai user Accept (lihat §7.3). |
| #4 Durabilitas | Usulan **durable**, di-key ke **`artifactId`** (tabel baru `artifact_edit_suggestions`). Editor terbuka → inline diff live; editor tertutup → **kartu aksi di chat + badge di artifact**, user navigasi sendiri lalu approve/reject. |
| #4 Discoverability | **Kartu aksi deterministik dari hasil tool** + badge; prosa LLM hanya pelengkap (jangan diandalkan, jangan klaim "sudah diedit"). |
| Konflik tulis | Guard ringan via `updatedAt` saat Accept; kalau block target hilang → tandai `stale`. |

## 3. Kondisi repo saat ini (hasil audit)

### 3.1 BlockNote (apps/web)
- Versi terpasang: `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn` semuanya **`^0.51.1`**. `@blocknote/xl-ai` **belum** terpasang.
- Editor: `apps/web/features/workspaces/components/blocknote-document-editor.tsx` — `useCreateBlockNote(initialEditorOptions, [])`, `useEditorChange` → `onContentChange({ blocksJson, markdown, plainText })`. `BlockNoteView` class `aqsha-blocknote`. **Editable penuh**, autosave debounce ~700ms.
- Loader: `blocknote-editor-loader.tsx` (dynamic import, SSR false).
- Reader: `artifact-detail-view.tsx` (`DocumentArtifactDetail`, `variant="page"`).
- Shell + chat: `artifact-reader-page-shell.tsx` — sudah membungkus `ComposerMentionsProvider` (ambient ref `{ kind:"paper", artifactId, … }`), `DetailSplitLayout`, `WorkspaceChatSidePanel`.
- Konten dibaca: `useArtifactRender(id)` → `GET /artifacts/:id/render-payload`. Disimpan: `PUT /artifacts/:id/document` via `useUpdateDocument` (invalidate `queryKeys.artifacts.detail(id)` + `.render(id)`).
- **Tiap block punya `id` stabil** — fondasi edit per-block.
- **Belum ada** handler selection; editor instance internal (belum di-expose).

### 3.2 Composer / mention system
- `ContextRef` union (4 kind: `workspace`, `paper`, `explore-paper`, `news`) di `packages/chat-core/src/index.ts:~416`.
- Mention marker private-use Unicode `U+E000`/`U+E001` (`MENTION_MARKER_OPEN/CLOSE`), `wrapMentionLabel()`, `parseMentionSegments()` (`packages/chat-core/src/index.ts:~498`).
- Pill: `createContextChipElement(ref)` + `inlinePillClass`/`MENTION_PILL_SHAPE` (`apps/web/features/threads/lib/composer-inline-editor.ts:~157`).
- Ambient set: `useSetAmbientContextRefs()` + pola *adjust-state-during-render* (`apps/web/features/thread-experience/components/composer-context-mentions.tsx:~59`).
- Kirim: `composer.tsx` → `onSend({ text, richText, clientContext, agentKind, command, attachmentIds })`.
- Hydration: `POST /threads/context/hydrate` → `buildNote()` (`packages/services/src/context.service.ts:~122`) menghasilkan blok `<system-reminder>` markdown.
- Strip marker sebelum LLM: `apps/agent/src/mastra/processors/strip-mention-markers.ts`.
- Render pill di bubble user: `UserMessageText` + `parseMentionSegments` (`message-list.tsx:~131`).
- **Belum ada** kind `selection`/`quote`.

### 3.3 Agent tools + service
- Baca: `get_render_payload` (mengembalikan `{ artifactType:"markdown", blocksJson, markdown, plainText }`), `get_artifact`, `list_artifacts`, `search_thread_documents`.
- Tulis: hanya `propose_artifact` (CREATE markdown, HITL percakapan). **Belum ada tool EDIT.**
- Service: `ArtifactService.updateDocument(db, { ownerUserId, artifactId, title?, blocksJson?, markdown?, plainText })` **sudah ada** (`artifact.service.ts:~1293`), dipakai web via `PUT /artifacts/:id/document` (`apps/api/src/routes/artifacts.ts:~156`). Tidak ada versioning (single-revision overwrite).
- DB: `artifacts` (metadata, `threadId`, `status`, `updatedAt`) + `artifact_contents` (`blocksJson` JSONB, `markdown`, `plainText`, `*_r2_key`).
- Pola tool: `createTool({ id, description, inputSchema(zod), execute })`; helper `callerId`/`callerEmail`/`threadScopeId` (`apps/agent/src/mastra/lib/tool-context.ts`), dan `AQSHA_CHAT_TURN_KEY` di RequestContext untuk menautkan ke turn. Daftar tool di `tools/index.ts` (`writeTools`).
- Thread→artifact via `artifacts.threadId`; `threadArtifactManifestProcessor` menyuntik manifest tiap turn.

### 3.4 BlockNote API yang dipakai (v0.51, terverifikasi via docs)
- Selection: `editor.getSelection() → { blocks: Block[] } | undefined`, `editor.getSelectedText()`, `editor.onSelectionChange(cb) → unregister`, `editor.getTextCursorPosition()`, `editor.setSelection(start, end)`.
- Edit by-id: `editor.getBlock(id)`, `updateBlock(id, …)`, `insertBlocks(blocks, refId, "before"|"after")`, `replaceBlocks(old, new)`, `removeBlocks([ids])`, `editor.document`.
- Konversi: `tryParseMarkdownToBlocks(md)`, `blocksToMarkdownLossy(blocks)`.
- Toolbar: `FormattingToolbarController` + `useComponentsContext().Components.FormattingToolbar.Button`.
- AI: `@blocknote/xl-ai` → `AIMenuController`, helper toolbar AI, dan rendering inline diff (insert/delete highlight + accept/reject). **Mesin penggeraknya = LLM-call internal xl-ai (AI SDK model)**, BUKAN proposal eksternal → ini titik spike utama (§8).

## 4. Arsitektur akhir (alur end-to-end)

```
SELECT → TOKEN
[1] Select block → tombol "Tanya Astra" (FormattingToolbarController + Components.FormattingToolbar.Button)
       editor.getSelection().blocks  +  getSelectedText()
[2] ArtifactSelectionContext (reader shell) → push ContextRef{ kind:"artifact-selection", artifactId, blockIds[], excerpt }
[3] Pill di composer (createContextChipElement + kind baru; dataset.blockIds/artifactId)

KIRIM → AGENT
[4] buildNote() cabang baru → excerpt + blockIds + instruksi "edit via propose_document_edit"
[5] Agent baca (get_render_payload bila perlu block tetangga) → putuskan edit

USUL → DURABLE
[6] Tool propose_document_edit(artifactId, operations[], summary)
       execute → TULIS record artifact_edit_suggestions (status=pending), validasi blockIds, return {suggestionId, …}
       (TIDAK menyentuh isi artifact)

TAMPIL
[7a] Editor TERBUKA: use-mastra-agent.ts deteksi tool-result → invalidate queryKeys.artifacts.suggestions(artifactId)
       → editor query pending → render inline diff (xl-ai) + Accept/Reject
[7b] Editor TERTUTUP: kartu aksi deterministik di chat ("Astra usulkan N perubahan pada {judul} → Tinjau")
       + badge jumlah usulan di artifact (list + header)

RESOLVE
[8] Accept → editor apply ops (tryParseMarkdownToBlocks + replaceBlocks/insertBlocks/removeBlocks)
       → autosave updateDocument (jalur existing) → POST resolve {accepted}
       → (opsional) system-note balik ke thread
    Reject → buang preview → POST resolve {rejected}
    Block target hilang → status=stale, tampilkan "blok sudah berubah"
```

**Prinsip kunci:** otoritas tulis isi artifact **tetap di editor live** (jalur autosave existing). Agent hanya **mengusulkan** (record durable). Tidak ada `ServerBlockNoteEditor` di jalur utama (lihat Fase 3 untuk opsional).

## 5. Kontrak data

### 5.1 `ContextRef` kind baru — `packages/chat-core`
```ts
export type ContextRef =
  | { kind: "workspace"; workspaceId: string; label: string }
  | { kind: "paper"; workspaceId: string; artifactId: string; label: string }
  | { kind: "explore-paper"; paperKey: string; label: string }
  | { kind: "news"; feedItemId: string; label: string }
  | { kind: "artifact-selection"; artifactId: string; blockIds: string[]; excerpt: string; label: string }; // BARU
```
- Label: `buildSelectionMentionLabel(excerpt)` → mis. `❝ "{clamp 24 char}…"` atau `❝ {n} blok`.
- `excerpt` = snapshot teks terpilih saat klik (clamp, mis. 500 char). Tepercaya rendah-risiko (dokumen milik user sendiri), tetap di-clamp.

### 5.2 Operasi edit (dipakai tool + tabel + apply)
```ts
type EditOp =
  | { op: "replace";     blockId: string; markdown: string }   // ganti isi block
  | { op: "insertAfter"; blockId: string; markdown: string }   // sisip setelah block
  | { op: "insertBefore";blockId: string; markdown: string }
  | { op: "delete";      blockId: string };                    // hapus block
```

### 5.3 Tabel baru `artifact_edit_suggestions` — `packages/db` (migrasi **0021**)
| kolom | tipe | catatan |
|-------|------|---------|
| `id` | text PK (uuid) | |
| `artifact_id` | text FK → `artifacts.id` ON DELETE CASCADE | **key utama query** |
| `owner_user_id` | text | scoping |
| `thread_id` | text NULL | thread asal |
| `turn_id` | text NULL | dari `AQSHA_CHAT_TURN_KEY` (link ke kartu chat) |
| `status` | enum `suggestion_status` `[pending,accepted,rejected,stale,superseded]` default `pending` | |
| `operations` | jsonb (`EditOp[]`) | |
| `summary` | text | ringkasan untuk kartu ("Ringkas paragraf intro") |
| `excerpt_before` | text NULL | snapshot isi block target (staleness/diff display) |
| `created_at` / `updated_at` / `resolved_at` | timestamptz | `resolved_at` NULL sampai accept/reject |

Index: `(artifact_id, status)`, `(owner_user_id)`.

### 5.4 Payload tool `propose_document_edit`
```ts
input:  { artifactId: string; operations: EditOp[]; summary: string }
output: { suggestionId: string; artifactId: string; operationCount: number; summary: string; status: "pending" }
```

### 5.5 API baru
- `GET  /artifacts/:id/suggestions?status=pending` → `EditSuggestion[]` (render editor + badge).
- `POST /artifacts/:id/suggestions/:sid/resolve` body `{ status: "accepted" | "rejected" }` → catat resolusi (apply isi dilakukan client via `PUT …/document` yang sudah ada).
- Badge count: tambahkan `pendingSuggestionCount` ke payload `GET /artifacts/:id` (detail) + item list artifact (hindari round-trip ekstra). Alternatif: endpoint `GET /artifacts/suggestions/counts?ids=`.

## 6. Fase 1 — Select → token + agent BACA (fondasi, risiko rendah)

**Hasil:** user select block → "Tanya Astra" → pill konteks di composer → agent paham & bisa membaca block itu (baca sudah jalan via `get_render_payload`). Belum ada edit.

Langkah & file:
1. `packages/chat-core/src/index.ts` — tambah kind `artifact-selection` + `buildSelectionMentionLabel()`. (build dist `@aqsha/chat-core`).
2. `apps/web/.../blocknote-document-editor.tsx`:
   - Expose editor (sudah ada instance) + pasang `FormattingToolbarController` dengan tombol **"Tanya Astra"** (`Components.FormattingToolbar.Button`).
   - Handler tombol: baca `editor.getSelection()?.blocks` → `blockIds`, `editor.getSelectedText()` → `excerpt`; panggil callback `onAskAstraAboutSelection(ref)` (prop dari shell).
3. `apps/web/.../artifact-reader-page-shell.tsx`:
   - Buat `ArtifactSelectionContext` (atau prop drilling ringan) yang menghubungkan handler editor → `useSetAmbientContextRefs` (append, bukan replace ambient `paper`).
   - Catatan React Compiler: hindari optional-chain di deps `useMemo` (assign `const` dulu) — lihat memory `composer-mention-fixes`.
4. `apps/web/.../composer-inline-editor.ts` — `createContextChipElement` handle kind `artifact-selection` (dataset `artifactId`, `blockIds`, render label ❝). Reuse `inlinePillClass("context")`.
5. `apps/web/.../message-list.tsx` — pastikan `parseMentionSegments`/`UserMessageText` merender pill kind baru di bubble (kemungkinan otomatis karena berbasis marker; verifikasi).
6. `packages/services/src/context.service.ts` — `buildNote()` tambah param `selections` + cabang yang mengeluarkan: excerpt inline + daftar `blockIds` + instruksi *"User merujuk blok spesifik (ids: …) pada artifact {id}. Untuk membaca konteks lengkap gunakan get_render_payload; untuk mengedit gunakan propose_document_edit dengan blockIds ini."*
7. `apps/api/src/routes/threads.ts` (`/context/hydrate`) + `HydratedContext` type — resolusi/validasi kind `artifact-selection` (cek artifact milik user; teruskan blockIds + excerpt clamp).

**Acceptance Fase 1:**
- Select 1–N block → tombol muncul → klik → pill ❝ tampil di composer.
- Kirim pesan "jelaskan bagian ini" → agent menjawab merujuk isi block yang benar (verifikasi note + `get_render_payload`).
- Pill tampil benar di bubble user setelah terkirim.
- `bun run lint && bun run typecheck` hijau; dist `chat-core`/`services` rebuilt.

## 7. Fase 2 — Agent edit dengan inline approval durable

**Hasil:** agent mengusulkan edit → record durable → inline diff (xl-ai) saat editor terbuka / kartu+badge saat tertutup → Accept/Reject → persist via jalur existing.

### 7.1 DB + Service + API
1. `packages/db` — tabel `artifact_edit_suggestions` (§5.3); `bun run db:generate` → migrasi **0021** (hati-hati collision: lihat memory `explore-pr51-merge`). Owner jalankan `db:migrate` dev (:5432) + prod (:5435) saat deploy.
2. `packages/services` — `SuggestionService` (atau perluas `ArtifactService`):
   - `createSuggestion({ ownerUserId, artifactId, threadId, turnId, operations, summary, excerptBefore })` → validasi ownership + tiap `blockId` ada di `blocksJson` saat ini (walk block tree); insert pending; return record. Bila ada blockId tak ditemukan → throw `appError` (agar agent re-read).
   - `listPendingByArtifact(ownerUserId, artifactId)`; `countPendingByArtifact(s)`.
   - `resolveSuggestion({ ownerUserId, suggestionId, status })` → set status + `resolved_at`. (Tidak menulis isi; isi ditulis client lewat `updateDocument`.)
3. `packages/db/src/appError.ts` — reuse pola error terstruktur untuk validasi (blockId hilang, bukan pemilik).
4. `apps/api/src/routes/artifacts.ts` — route `GET …/suggestions`, `POST …/suggestions/:sid/resolve`; tambah `pendingSuggestionCount` ke detail + list item.

### 7.2 Agent tool
5. `apps/agent/src/mastra/tools/propose-document-edit.ts` — `createTool` (pola `save-url.ts`):
   - `inputSchema` = §5.4 (`operations` `.min(1)`).
   - `execute` → `callerId(ctx)`, `threadScopeId(ctx)`, `turnId` dari `AQSHA_CHAT_TURN_KEY`; panggil `SuggestionService.createSuggestion`; return `{ suggestionId, … }`. **TANPA `requireApproval`** (approval = UX inline).
6. `apps/agent/src/mastra/tools/index.ts` — daftarkan di `writeTools`.
7. Instruksi agent (system prompt `createAstraAgent`): jelaskan tool ini **mengusulkan** (bukan menerapkan); wajib pakai `blockId` dari konteks selection; **dilarang mengklaim dokumen sudah berubah** — arahkan user meninjau usulan.

### 7.3 Frontend — render + apply (xl-ai)
8. `apps/web/package.json` — tambah `@blocknote/xl-ai` **versi `~0.51.1`** (match core/react). Reinstall.
9. `apps/web/features/.../api.ts` (artifacts) — hook `useArtifactSuggestions(artifactId)` (poll/by-query) + `useResolveSuggestion()`; `queryKeys.artifacts.suggestions(id)`.
10. `apps/web/.../use-mastra-agent.ts` — deteksi tool-result `propose_document_edit` di stream → `qc.invalidateQueries(queryKeys.artifacts.suggestions(artifactId))` + simpan info untuk **kartu chat**.
11. `apps/web/.../message-list.tsx` (atau komponen part) — `ChatSuggestionCard`: render deterministik dari tool-result ("Astra mengusulkan {n} perubahan pada {judul} → Tinjau") dengan tombol navigasi ke artifact reader (buka + scroll ke usulan). **Jangan** bergantung prosa LLM.
12. `apps/web/.../blocknote-document-editor.tsx`:
    - Integrasi `@blocknote/xl-ai` (AI extension + UI diff). Saat mount & saat `useArtifactSuggestions` berubah → **hydrate** pending `operations` ke state diff xl-ai (lihat spike §8) → tampil highlight insert/delete + Accept/Reject per usulan.
    - **Accept:** `tryParseMarkdownToBlocks(op.markdown)` → `replaceBlocks([blockId], blocks)` / `insertBlocks(blocks, blockId, after|before)` / `removeBlocks([blockId])`; lalu `updateDocument` (autosave existing) menyimpan blocksJson/markdown/plainText bersih; `useResolveSuggestion(accepted)`.
    - **Reject:** revert preview xl-ai; `useResolveSuggestion(rejected)`.
    - **Persistence safety (syarat keras §2):** selama ada usulan dalam mode preview, **pause autosave** (jangan serialize+persist `editor.document`) supaya teks usulan yang belum di-accept TIDAK ikut tersimpan. Resume setelah accept (simpan hasil bersih) atau reject (revert). Kontaminasi *visual* boleh; kontaminasi *persisted* tidak.
    - **Staleness:** sebelum apply, cek `editor.getBlock(blockId)` ada & (opsional) cocok `excerpt_before`; bila hilang → tandai usulan `stale`, tampilkan "blok sudah berubah, usulan tak bisa diterapkan".
    - **Konflik tulis:** saat Accept, sertakan/periksa `updatedAt` artifact (guard last-write).
13. Badge: artifact list item + header reader baca `pendingSuggestionCount` → tampilkan "{n} usulan".
14. (Opsional) Setelah resolve, kirim system-note ke thread (mis. via tool-context/processor) agar agent tahu hasil di turn berikutnya.

**Acceptance Fase 2:**
- Editor terbuka: minta "ringkas paragraf intro" → diff highlight muncul di block target → Accept mengubah dokumen & tersimpan; Reject mengembalikan utuh.
- Editor tertutup saat usulan dibuat → kartu di chat + badge di artifact; buka artifact → usulan menunggu, bisa Accept/Reject.
- Usulan yang belum di-accept **tidak** tersimpan ke DB (cek `artifact_contents` tidak berubah sampai Accept).
- Block target dihapus user sebelum approve → usulan jadi `stale`, tidak salah-tempel.
- Refresh saat usulan pending → usulan tetap ada (durable).
- Gates hijau (lint/typecheck/test web+agent+services), dist rebuilt.

## 8. Spike WAJIB sebelum kunci Fase 2 (≈ setengah hari)

**Pertanyaan inti:** bisakah `@blocknote/xl-ai` dipakai untuk **merender diff dari `operations` eksternal** (record durable), bukan dari LLM-call internalnya?

- Telusuri API xl-ai 0.51: apakah ada cara meng-apply "suggested change set" / masuk ke mode diff secara programatik (mis. lewat editor transaction/extension API) tanpa memanggil model.
- **Jika BISA:** hydrate operations → diff xl-ai. Ideal.
- **Jika TIDAK** (xl-ai hanya mau didorong LLM-call internal): fallback = render diff via **custom overlay/decoration** yang meniru visual xl-ai, di-feed dari record durable yang sama. Kontrak data (§5) tidak berubah; hanya layer render berbeda.
- Cek juga: apakah xl-ai mewajibkan konfigurasi model (AI SDK) walau kita tak memakai LLM-nya → kalau ya, set stub/no-op.

Output spike: keputusan "xl-ai-driven" vs "custom-overlay", didokumentasikan di sini sebelum lanjut §7.3 poin 12.

## 9. Fase 3 — opsional (server-side apply)

Untuk kasus agent perlu menulis tanpa editor terbuka (mis. batch / background / hasil `/deep`):
- Tambah `@blocknote/server-util` (`ServerBlockNoteEditor`) di `packages/services` untuk markdown↔blocks + manipulasi by-id di Node.
- Tool `apply_artifact_edit` (atau perluas) yang menulis langsung via `updateDocument`.
- **Tidak dikerjakan** kecuali kebutuhan muncul; alur utama (#4) sudah menutup skenario editor-tertutup lewat usulan durable.

## 10. Risiko & mitigasi

| Risiko | Mitigasi |
|--------|----------|
| xl-ai tak bisa di-feed operations eksternal | Spike §8 dulu; fallback custom overlay (kontrak data sama). |
| Usulan preview ikut tersimpan (korupsi dokumen) | **Pause autosave** selama preview; persist hanya saat Accept (§7.3). |
| blockId stale (user edit duluan) | Validasi `getBlock` + `excerpt_before`; status `stale`. |
| Konflik user vs usulan (no versioning) | Guard `updatedAt` saat Accept; last-write + invalidate. |
| LLM klaim "sudah diedit" (menyesatkan) | Kartu deterministik dari tool-result; instruksi agent eksplisit; prosa pelengkap. |
| Markdown↔blocks lossy | Edit **by-block** (snippet kecil) jalur utama; rewrite penuh hanya fallback. |
| Migrasi collision 0021 | Ikuti pola memory `explore-pr51-merge`; full-restart setelah `db:migrate`. |

## 11. Test plan
- **Unit/service:** `createSuggestion` (validasi ownership + blockId), `resolveSuggestion`, count. (runner `packages/services`).
- **Agent:** tool `propose_document_edit` membuat record pending + return shape; error saat blockId tak ada. (runner `apps/api`/agent sesuai konfigurasi).
- **E2E (owner, Clerk):** alur §7 acceptance — editor terbuka & tertutup, accept/reject, stale, durabilitas refresh.

## 12. Ringkas file yang disentuh

**chat-core:** `src/index.ts` (kind + label).
**db:** schema `artifactEditSuggestions.ts` + migrasi `0021`.
**services:** `context.service.ts` (buildNote), `suggestion.service.ts` (baru) atau `artifact.service.ts`.
**api:** `routes/artifacts.ts` (suggestions GET/resolve + count), `routes/threads.ts` (hydrate kind baru).
**agent:** `tools/propose-document-edit.ts` (baru), `tools/index.ts`, system prompt `createAstraAgent`.
**web:** `blocknote-document-editor.tsx` (toolbar btn + xl-ai diff + apply), `artifact-reader-page-shell.tsx` (selection context + badge), `composer-inline-editor.ts` (pill), `message-list.tsx` (pill + ChatSuggestionCard), `use-mastra-agent.ts` (intercept), `features/.../api.ts` (hooks + queryKeys), `package.json` (`@blocknote/xl-ai`).

## 13. Urutan eksekusi disarankan
1. **Fase 1** penuh (value cepat, fondasi konteks).
2. **Spike §8** (xl-ai).
3. **Fase 2** (DB → service → API → agent tool → FE render/apply → badge/kartu).
4. Fase 3 hanya bila perlu.
