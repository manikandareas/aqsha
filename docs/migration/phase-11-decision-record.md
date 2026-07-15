# Phase 11 decision record — Hardening, Phase 10 skip, seam completion

> Bagian dari **Phase 11** (§10 [`svelte-plan.md`](svelte-plan.md)).
> Tanggal: 2026-07-15. Melanjutkan Phase 1–9. Bahasa Indonesia; nama package/API/simbol tetap English
> (AGENTS.md). Ledger: [`parity-ledger.md`](parity-ledger.md).

Phase 11 di-lean-kan (§0 #4/#5): tanpa soak, tanpa visual-regression blocking. Dua hal besar terjadi di
fase ini: (A) **keputusan melewati Phase 10** (editor dokumen di-redesign pasca-cutover) + hygiene read-only,
dan (B) **penyelesaian empat seam Phase 8/9** yang ternyata masih stub padahal ledger menandainya `done`.

---

## 1. Phase 10 DILEWATI — editor di-redesign pasca-cutover (§0 #9)

**Keputusan (owner, 2026-07-15):** document editing akan di-**redesign** setelah cutover, bukan diport 1:1
dari BlockNote React. Alasan: port 1:1 = throwaway pada gate termahal migrasi (round-trip zero-loss, XL AI
accept/reject, per-editor citation store); nol user → tak ada editing experience live yang perlu dilindungi.
Pilihan engine (pertahankan BlockNote vs ganti total) **ditunda** ke workstream redesign.

Dampak yang diterima sadar: pada cutover, document editing = **read-only** (state Phase 9); Astra tak bisa
menulis ke dokumen (`request_document_edit`), sitasi tak bisa ditanam ke dokumen.

Perubahan dokumen: plan §0 #9 (keputusan terkunci baru), §8.9, §10 Phase 10, §16 #3/#4, §14 PR 15/16;
ledger BLK-1..7 + CSS-2 → `superseded-pending`.

### 1.1 Hygiene read-only (no dead affordance)

| Fix | File |
|---|---|
| Gate afordansi "buat dokumen" (menu toolbar + context-menu board + CTA empty-state) di balik `DOCUMENT_AUTHORING_ENABLED = false` — membuat blank doc yang lalu terbuka read-only = jebakan | `lib/features/workspaces/document-authoring.ts` (baru), `WorkspaceBoardToolbar.svelte`, `WorkspaceLibraryBoard.svelte`, `WorkspaceLibraryEmpty.svelte` |
| Copy artifact reader page-variant: "Editor dokumen hadir di fase berikutnya" → "Dokumen ini tampil read-only untuk saat ini" (tak menjanjikan timeline) | `ArtifactDetailView.svelte` |
| Copy citation empty-state: buang "disisipkan ke dokumen" (kapabilitas ditunda) | `CitationEmptyState.svelte` |
| Dokumentasikan handler Astra `request_document_edit` sebagai no-op sengaja (undefined callback) pending redesign | `thread-agent.svelte.ts` |

Uploads & "save URL" tetap aktif — artifact itu read-only by design (paper/PDF/link), bukan authored doc.

---

## 2. Empat seam Phase 8/9 diselesaikan (wire-to-parity)

Sweep hygiene menemukan empat afordansi yang masih stub ("hadir di fase berikutnya") meski ledger menandai
`done`. Owner memilih **wire keempatnya**. Semuanya reuse API/model yang sudah ada + tested.

| Gap | Sebelum | Sesudah | File |
|---|---|---|---|
| **1. Save-to-workspace** | toast stub (discovery) + afordansi hilang (chat card) | Dialog picker (discovery) + Popover picker (chat card) → `useSaveUrl`/`useLinkArtifactToWorkspace` | `WorkspacePicker.svelte` (baru), `SaveToWorkspaceButton.svelte`, `ChatArtifactCard.svelte` |
| **2. @mention workspace picker** | palette kosong, drill no-op (`contextWorkspaces=[]`) | `useWorkspacesList` (top-level palette) + `useContextPickerArtifacts(() => drillWorkspaceId)` (drill-in on demand) | `Composer.svelte` |
| **3. Artifact-page Chat Astra** | placeholder side panel | `ExploreChatSidePanel` + ambient `paper` ContextRef via `ComposerMentions.syncAmbientFromPage` | `ArtifactReaderPageShell.svelte` |
| **4. Thread panel artifact viewer** | placeholder ("mode artifact/context") | `ArtifactDetailView variant="panel" embedded` (reachable dari klik chat artifact card via `openArtifactPanel`) | `DetailPanel.svelte`, `ArtifactDetailView.svelte` (prop `embedded` baru) |

### 2.1 Divergensi terdokumentasi (functional parity, bukan 1:1)

- **Gap 3 thread switcher scope:** web `WorkspaceChatSidePanel` men-scope daftar thread ke workspace;
  reuse `ExploreChatSidePanel` menampilkan daftar thread **global**. Fungsi inti (chat tentang artifact
  ini + arsip thread baru ke workspace) tetap jalan via ambient `paper` ContextRef yang membawa
  `workspaceId`. Scoping switcher = satu-satunya beda. Follow-up: `WorkspaceChatSidePanel.svelte` tipis
  bila scoping diinginkan.
- **Gap 3 `ambientWorkspaceId` palette hint** tidak diteruskan ke chat surface (kosmetik: urutan palette).
- **Gap 4 `embedded` mode** menekan `PanelCardToolbar` milik `ArtifactDetailView` (host `DetailPanel` sudah
  punya header + close) → aksi info/delete artifact tak muncul di preview thread; tersedia penuh di reader
  workspace. Divergensi minor.
- **Gap 4 `context` (tab Workspace) TIDAK dibuat.** Mode `context` **tak reachable** (nol pemanggil
  `openContextPanel`; hanya via `?panel=c` manual) dan butuh komponen library-in-thread + `workspaceId`
  yang tak ada di model thread. Ditinggal sebagai placeholder netral (bukan dead affordance karena tak ada
  yang membukanya). Follow-up sub-fitur tersendiri.

### 2.2 Yang TIDAK ditambah

Folder-step pada save-to-workspace (web hanya pilih workspace); "Tanya Astra tentang seleksi blok" di
editor (bergantung editor = redesign).

---

## 3. Verifikasi (gate Phase 11)

| Gate | Hasil |
|---|---|
| `typecheck` (svelte-check) | **0 errors / 0 warnings** (7340 files) |
| `test` (vitest) | **294 passed / 46 files** |
| `build` (content-collections + vite + adapter-node) | **OK** (exit 0) |
| `lint` (prettier + eslint) | prettier clean; eslint clean |
| Security audit (§11 #5) | lihat §4 |
| Browser verification 4 gap (owner session, localhost:5173 + backend VPS/Tailscale) | **SEMUA HIJAU** — lihat §4.1 |

Runes/idiom: gap baru pakai getter-arg query (`create*(() => …)`), `$derived`/`$derived.by`, context channel
`.svelte.ts`; tak ada module-level mutable state, `$effect` hanya untuk sinkron eksternal (`syncAmbientFromPage`),
tak ada import React/Radix-React/Lucide langsung.

## 4. Security audit (§11 #5, WAJIB — hygiene pra-launch)

**Verdict: nol P0/P1. Ketujuh surface + 4 komponen baru = PASS.** Ringkas per surface:

| Surface | Hasil |
|---|---|
| 1. Auth/token leakage | PASS — token per-request (`locals.auth().getToken()`), `handleFetch` inject bearer HANYA saat `url.startsWith(PUBLIC_API_URL)`; `$lib/server/*` boundary bersih (nol impor dari client); tak ada token di prop/log. |
| 2. Env | PASS — secrets via `$env/dynamic/private` di `lib/server/env.ts` saja; nol `$env/static/*`/`process.env` runtime; hanya `PUBLIC_*` non-secret ke client. |
| 3. XSS | PASS — `Response.svelte` `renderHtml` off + link/image allowlist; hanya 3 `{@html}` (JSON-LD escaped + MDX build-time trusted); artifact HTML/SVG = `iframe sandbox=""` + CSP `script-src 'none'`; Mermaid `securityLevel:'strict'`. |
| 4. Upload | PASS — allowlist ext+MIME, cap 20 file, cap 50MB (client UX gate; server `packages/services` = gate otoritatif). |
| 5. Redirect | PASS — semua `redirect()`/`goto()` = path internal statis / ID app; nol absolute-URL user-controlled; Mayar checkout = URL API terpercaya. |
| 6. CSRF/origin | PASS — nol form action; mutation via bearer header (bukan cookie ambient) = CSRF-resistant; `checkOrigin` default on. **P2:** set `ORIGIN`/`trustedOrigins` di deploy Phase 12. |
| 7. Proxy (SSRF) | PASS — `forwardToAgent` host dari `MASTRA_AGENT_ORIGIN` saja (path/query dari request); Sentry tunnel guard `ingestUrl` match (403 mismatch). |
| Kode Phase-11 baru | PASS — semua render text auto-escaped Svelte; nol `{@html}`/`innerHTML`/redirect dinamis. |

**P2 informational (bukan blocker):** (1) allowlist upload OR-logic + client-side → gate otoritatif tetap
server `packages/services`; (2) set `ORIGIN` saat cutover Dokploy (Phase 12) agar logika origin di belakang
proxy benar.

### 4.1 Browser verification 4 gap (2026-07-15, live)

Diverifikasi end-to-end di `localhost:5173` (dev server lokal → API/agent lokal → infra VPS via Tailscale), akun owner signed-in, data nyata (4 workspace + threads).

| Gap | Bukti live |
|---|---|
| **1a** save-to-workspace (Explore) | Kartu paper → ikon folder → Dialog "Simpan ke workspace" + `WorkspacePicker` (4 workspace) → pilih Research → toast hijau **"Disimpan ke workspace"** + dialog tutup. Error path juga terlihat ("Artifact title is too long" via `readableApiErrorMessage`). |
| **1b** save-to-workspace (chat card) | Kartu artifact agen → ikon folder → **Popover** "Simpan ke workspace" + picker → pilih Research → badge **"✓ Tersimpan"** menggantikan ikon (`useLinkArtifactToWorkspace`). |
| **2** @mention picker | Ketik `@` → palette "Konteks 4" (4 workspace) → pilih = chip `@E2E Citation Test`; dedup "sudah jadi konteks"; drill `>` Research → **10 artifact** (`useContextPickerArtifacts`) → pilih = chip `@Research:Laporan Riset…`. |
| **3** artifact-page chat | Buka artifact reader page → tombol "Chat" → panel chat **nyata** (bukan placeholder) + composer **auto-pin chip `@Research:Laporan Riset…`** (ambient `paper` ContextRef via `syncAmbientFromPage`). |
| **4** thread artifact preview | Prompt Astra buat dokumen → `ChatArtifactCard` render → klik judul → URL `?panel=a:<id>` → panel kanan "Dokumen" + **`ArtifactDetailView variant=panel embedded`** render 3-poin read-only (header tunggal, no double toolbar). |

Bonus terlihat: markdown reader read-only + copy hygiene "Dokumen ini tampil read-only untuk saat ini." (§1.1) render benar.

**Observasi → FIXED (§4.2):** navigasi langsung/reload ke sebuah thread detail menampilkan **hero kosong** alih-alih meng-*seed* riwayat; riwayat baru muncul setelah mengirim pesan. Root cause ditemukan + diperbaiki (lihat §4.2).

### 4.2 Fix: thread history seed on cold-load

**Root cause:** latch `historySettled` di `ThreadDetailShell.svelte` (dan `ExploreThreadChat.svelte`) di-gate pada `!history.isFetching`. Saat Clerk cold-load, query history **disabled** (`enabled: … && clerkLoaded && userId`), dan query disabled melaporkan `isFetching === false` → latch settle **sebelum** fetch jalan → agen dibuat dengan seed kosong (`history.data` masih `undefined` → `[]`) → thread render hero kosong. Ketika history asli tiba, agen sudah terbangun (via `untrack`) sehingga tak pernah di-apply.

**Fix:** gate latch pada `history.isFetched` (true hanya setelah fetch pertama resolve, tetap false saat disabled/pending) alih-alih `!history.isFetching`. Diterapkan di `ThreadDetailShell.svelte` + `ExploreThreadChat.svelte`.

**Verified (live, cold-load reload):** thread yang tadinya hero kosong kini seed riwayat penuh (user prompt + clarify + `setuju buatkan` + Selesai + `ChatArtifactCard`) langsung saat load. Typecheck 0/0, prettier clean.

## 5. Follow-ups tersisa (tracked, bukan blocker cutover)

1. **Editor dokumen redesign** (Phase 10 diganti) — workstream terpisah; putuskan engine + format data.
2. **Tab Workspace (`context`) di thread panel** — komponen library-in-thread + plumbing `workspaceId`.
3. **`WorkspaceChatSidePanel` workspace-scoped** (Gap 3 divergensi) bila scoping switcher diinginkan.
4. ~~Browser verification owner-session untuk 4 gap~~ — **SELESAI 2026-07-15** (§4.1, semua hijau).
5. ~~Thread history seed on cold-load~~ — **FIXED** (§4.2): latch di-gate `history.isFetched` bukan `!isFetching`.
6. Warisan Phase 9: PDF text-layer + citation highlight, DnD touch/keyboard (sudah tercatat di DR Phase 9).
