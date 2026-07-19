# Research-first Fase 7: per-hunk diff review untuk usulan suntingan Astra — desain

Status: brainstorm disepakati 2026-07-19.
Scope: `packages/services` + `apps/api` + `apps/svelte`. Tanpa migrasi skema, tanpa
perubahan `apps/agent` (alur propose agen tidak berubah).
Rujukan: master spec `2026-07-17-research-first-repositioning-design.md`, Fase 6
`2026-07-18-research-first-phase6-pdf-annotation-agent-loop-design.md` (keputusan #8:
granularitas whole-proposal, per-hunk = Fase 7).

## Tujuan

Reviewer bisa menerima/menolak **per hunk** (segmen diff) pada kartu usulan suntingan
Astra: hanya hunk yang dicentang yang diterapkan ke sumber bab; sisanya tetap seperti
sumber lama. Invariant Fase 5/6 dipertahankan: **tidak ada sumber yang dipersist tanpa
pernah lolos compile** (hasil parsial di-dry-run dulu), dan persist tetap CAS terhadap
`baseVersion`.

## Keputusan desain (hasil brainstorm)

1. **Hunks diturunkan di server, tanpa migrasi.** Proposal tetap menyimpan
   `proposedSource` utuh + `baseVersion` (skema `section_edit_proposals` tidak berubah).
   `getPending` menghitung hunks dari `(currentSource, proposedSource)` via
   `structuredPatch` (lib `diff`, dependency baru `packages/services`, versi `^9.0.0`
   sama dengan FE) dan mengembalikannya di `PendingProposalView`. FE hanya merender
   hunks dari server (buang `diffLines` lokal) dan mengirim indeks terpilih saat accept.
   Server menghitung ulang hunks dengan fungsi yang sama saat accept; stabilitas
   identitas indeks dijamin guard versi (keputusan 3), bukan hash.
2. **Rekonstruksi subset deterministik.** Hunks hasil satu `structuredPatch` atas basis
   yang sama selalu terurut dan tak saling tumpang tindih → rekonstruksi = jalan linear
   atas baris basis: hunk diterima → terapkan barisnya (`' '`/`'-'`/`'+'`), hunk ditolak
   → salin baris lama apa adanya. Tanpa anchoring tekstual, tanpa ambiguitas. Baris
   konteks/`-` diverifikasi cocok dengan basis; mismatch = bug internal → throw
   (bukan union), karena guard versi seharusnya membuatnya mustahil.
3. **Stale tetap reject-only, tanpa rebase.** Sumber bergeser sejak proposal dibuat
   (`baseVersion !== currentVersion`) → semua checkbox nonaktif, hanya Tolak; jalur
   pemulihan = minta Astra propose ulang dari sumber terkini (paritas Fase 6). Di
   server, accept per-hunk mengecek versi dulu; bergeser → proposal di-supersede dan
   union `stale` dikembalikan — race view→accept tidak pernah salah-terapkan hunk.
   CAS `saveDocument` tetap lapisan pengaman kedua.
4. **Accept parsial bersifat final.** Proposal jadi `accepted`, hunk tak terpilih
   dibuang (tidak ada "sisa pending"; agen bisa propose ulang), **semua** anotasi
   terkait di-`resolved` — paritas semantik accept penuh hari ini. Pemetaan
   hunk→anotasi tidak tersedia dan tidak dicoba.
5. **UX default = semua tercentang.** Satu klik Terima ≡ perilaku hari ini; uncheck
   hanya untuk pengecualian. Toggle "Pilih semua", tombol "Terima (N/M)", N=0 →
   disabled.
6. **Fast-path all-selected.** Semua hunk terpilih (atau parameter indeks tidak
   dikirim) → hasil ≡ `proposedSource` yang sudah lolos dry-run saat propose → terapkan
   tanpa compile ulang (jalur accept existing). Hanya subset sejati yang memicu
   dry-run compile baru.

## Kontrak & tipe

### `packages/services/src/latex/hunks.ts` (modul baru)

```ts
export type ProposalHunk = {
  index: number;      // posisi dalam daftar hunks — identitas yang dikirim FE saat accept
  oldStart: number;   // 1-based, baris basis
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];    // prefiks ' ' konteks, '-' hapus, '+' tambah
};

export function computeProposalHunks(baseSource: string, proposedSource: string): ProposalHunk[];
export function applyHunkSelection(
  baseSource: string,
  hunks: ProposalHunk[],
  acceptedIndexes: ReadonlySet<number>,
): string;
```

- `computeProposalHunks` membungkus `structuredPatch` dengan `context: 3`. Deterministik
  untuk input sama (lib+opsi sama di getPending dan accept).
- `applyHunkSelection` memegang properti: `accepted = semua` → hasil identik
  `proposedSource` (termasuk perilaku trailing newline); `accepted = ∅` → identik
  `baseSource`. Ini dites eksplisit.

### `PendingProposalView` (services + mirror FE)

Bertambah `hunks: ProposalHunk[]` — dihitung dari `(currentSource, proposedSource)`,
termasuk saat stale (display-only; accept dinonaktifkan di FE dan ditolak guard versi
di server).

### `SectionProposalService.accept`

```ts
accept(db, {
  ownerUserId, proposalId,
  acceptedHunkIndexes?: number[],   // absen = terima utuh (jalur lama)
}): Promise<AcceptProposalResult>

type AcceptProposalResult =
  | { status: "accepted"; contentVersion: number }
  | { status: "stale"; currentVersion: number }
  | { status: "compile_error"; compileErrors: CompileError[] };  // varian baru
```

Alur saat `acceptedHunkIndexes` dikirim:

1. `assertPendingProposal` (existing).
2. Muat dokumen; `(doc?.contentVersion ?? 0) !== proposal.baseVersion` → tandai
   `superseded` + return `stale` (paritas perilaku CAS existing, hanya lebih awal).
3. Hitung `hunks = computeProposalHunks(doc.source, proposal.proposedSource)`
   (`doc.source ≡ basis` karena guard versi; proposal `baseVersion 0`/bab kosong basis
   = string kosong).
4. Validasi indeks: duplikat dibuang; kosong atau di luar `[0, hunks.length)` →
   appError 422 `invalid_hunk_selection` (FE mencegah, ini guard).
5. Semua indeks terpilih → fast-path: lanjut jalur lama dengan `proposedSource`
   (tanpa compile).
6. Subset sejati → `applyHunkSelection` → **dry-run compile** (paritas `propose`:
   `loadSectionCompileContext` + `assembleSection` + `LatexCompileService.compile`;
   build resmi tak tersentuh) → gagal → return `compile_error`, **proposal tetap
   `pending`** (user bisa ubah pilihan atau Tolak). Sumber parsial juga dicek
   `LATEX_SOURCE_MAX_BYTES` sebelum compile (413 paritas propose).
7. Sukses → `saveDocument` CAS (`baseVersion` bila > 0, `author: 'agent'`) →
   `stale_write` → supersede + `stale` (lapisan kedua); sukses → `accepted` +
   anotasi `resolved` (existing).

Rate limit: langkah 6 mengonsumsi bucket `latex:compile` **sebelum** compile (satu
compile nyata; satu bucket dengan compile user dan propose agen, fail-open pada store
error — paritas propose). Jalur tanpa compile (utuh/fast-path) tidak mengonsumsi.

### API (`apps/api/src/routes/workspaces.ts`)

`POST /sections/:id/proposals/:pid/accept` menambah body opsional
`{ acceptedHunkIndexes?: number[] }` (`t.Optional(t.Object({ acceptedHunkIndexes:
t.Optional(t.Array(t.Integer({ minimum: 0 }))) }))`). Respons mengikuti union baru.
Route reject dan getPending tidak berubah bentuk (getPending otomatis membawa `hunks`).

## FE (`apps/svelte`)

### `features/sections/api.ts`

- `PendingProposalView` + `hunks: ProposalHunk[]` (tipe di-mirror manual, paritas pola
  file ini).
- `AcceptProposalResult` + varian `compile_error`.
- `useAcceptProposal`: `mutationFn` menerima `{ proposalId, acceptedHunkIndexes?:
  number[] }`; invalidation existing dipertahankan.

### `ProposalReviewCard.svelte`

- Buang `diffLines`/dependency `diff` dari kartu (hapus dari `apps/svelte` bila tak ada
  pemakai lain; kalau masih dipakai fitur lain, biarkan).
- Render **blok per hunk**: header kecil (`Hunk k · baris a–b`) + checkbox per hunk
  (default tercentang; komponen Checkbox `@aqsha/ui-svelte`); isi = baris diff dengan
  pewarnaan existing (`+` mint, `-` coral, konteks polos). Hunk tak tercentang → konten
  di-dim (opacity) sebagai sinyal "tidak akan diterapkan".
- Header kartu: checkbox "Pilih semua" (indeterminate saat sebagian).
- Tombol **"Terima (N/M)"**: disabled saat `N === 0 || stale || accepting`. `N === M` →
  panggil accept **tanpa** `acceptedHunkIndexes` (fast-path server). Stale → semua
  checkbox nonaktif (banner existing dipertahankan).
- Hasil `compile_error` → daftar error compile (line + pesan) tampil inline di kartu,
  kartu tetap terpasang, pilihan checkbox dipertahankan; user mengubah pilihan lalu
  coba lagi, atau Tolak.

### `SectionEditorPage.svelte`

- `handleAcceptProposal` meneruskan indeks terpilih dari kartu dan menangani tiga
  varian: `accepted` → toast + `requestCompile()` (existing); `stale` → toast warning
  existing; `compile_error` → toast warning ("Hasil pilihan hunk gagal compile") — detail
  error dirender kartu.

## Testing & verifikasi

- **Unit `packages/services/test/hunks.test.ts`**: roundtrip all/none/subset; multi-hunk
  berdekatan (context menyatu vs terpisah); edit di baris pertama/terakhir; trailing
  newline (ada/tidak di kedua sisi); basis kosong (draf awal); indeks duplikat.
- **Service `section-proposal.test.ts`** (tambahan): partial accept happy path (sumber
  akhir = basis + hunk terpilih saja, versi naik, proposal `accepted`, anotasi
  `resolved`); `compile_error` path (subset yang merusak — mis. hunk yang membuang
  `\end{...}` pasangannya di hunk lain — proposal tetap `pending`); stale via guard
  versi; indeks invalid/kosong → 422; fast-path all-selected tidak memanggil compile
  (spy/stub compile service).
- **API `apps/api/test/proposals.test.ts`**: accept dengan body `acceptedHunkIndexes`,
  varian respons baru.
- `bun run typecheck` — services 0 error; svelte hanya 2 baseline `DetailPanel:158-159`.
- Verifikasi e2e/browser bila memungkinkan: loop anotasi → propose → **partial accept**
  → recompile; plus kasus compile_error di kartu.
- Operasional: `bun run build:dist` + restart proses sebelum verify (api/agent impor
  dist); runtime agen = Node.

## Luar scope

- Rebase per-hunk atas sumber bergeser (stale tetap reject-only).
- Pemetaan hunk→anotasi (resolusi anotasi granular).
- Sisa hunk sebagai proposal pending baru.
- Perubahan alur propose agen / tool agen.
- Sandbox OS-level compiler (prasyarat prod pra-cutover berikutnya, di luar fase ini).
