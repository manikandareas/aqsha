# Migration harness — `apps/web` → `apps/svelte`

Harness yang dibuat pada **Phase 0** dari [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md). Tujuannya: mengunci baseline `apps/web` dan menyediakan **entry point pencarian source→target** plus **checklist scope** agar rewrite raksasa benar-benar *selesai* tanpa kehilangan fitur secara diam-diam (§3.1 scope discipline, nol user).

Ini bukan sistem klaim konkuren — eksekusi sequential, satu owner (§0 #2). Ledger = checklist Markdown biasa.

## Isi

| File | Isi |
|---|---|
| [`baseline.md`](baseline.md) | Freeze declaration + commit reference `apps/web`. |
| [`apps-svelte-parity-ledger.md`](apps-svelte-parity-ledger.md) | **Ledger** — checklist scope 100% route + feature (source→target, phase, status). |
| [`manifests/route-manifest.md`](manifests/route-manifest.md) | Semua route/layout/handler Next.js + URL + target Svelte. |
| [`manifests/feature-manifest.md`](manifests/feature-manifest.md) | Inventaris modul per feature; pure-logic (`.ts`, port dulu) vs React view. |
| [`manifests/import-manifest.md`](manifests/import-manifest.md) | Dependency React/Next yang dipakai + jumlah file + target Svelte. |
| [`manifests/env-manifest.md`](manifests/env-manifest.md) | Env var + scope (public/private/build) + mapping `$env/dynamic/*`. |
| [`fixtures/`](fixtures/) | Fixtures correctness-critical (timeline, citation export, upload, marquee, BlockNote) tanpa secret/PII. |
| [`screenshots/`](screenshots/) | Capture manifest reference screenshot per surface (eyeball diff, bukan pixel-gate). |

## Cara pakai per phase (§15)

1. Baca `AGENTS.md`, plan phase terkait, dan **baseline.md** (freeze commit).
2. Pakai **manifests** sebagai entry point pencarian; tetap jalankan `rg` untuk consumer/transitive sebelum mengubah target (code lebih authoritative dari plan/manifest).
3. Port **pure test/model** sebelum view (lihat feature-manifest kolom "Pure logic").
4. Verifikasi terhadap **fixtures** (contract byte-exact) + **screenshots** (eyeball).
5. Update **ledger** (status + target module aktual) di PR yang sama.

## Angka baseline (snapshot Phase 0, commit `ec04389`)

- Route/layout/handler Next.js: **45 file** (lihat route-manifest).
- Feature area: **13** (`apps/web/features/*`).
- Pure-logic module (`.ts`, non-`.tsx`) di `features` + `lib`: **~95** (port-first).
- Test correctness-critical yang direuse: **9** di `apps/web` + relevan di `packages/{services,chat-core,db}`.
- `@aqsha/ui` (React-only) diimpor **118 file** → butuh adapter UI/icon lokal Svelte (§13 "React-only @aqsha/ui").
- `@aqsha/chat-core` (framework-agnostic) diimpor **42 file** → reuse langsung.
