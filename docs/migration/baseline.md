# Baseline freeze — migrasi `apps/web` → `apps/svelte`

> Bagian dari **Phase 0** (§10 [`../apps-svelte-migration-plan.md`](../apps-svelte-migration-plan.md)).
> Dokumen ini mengunci **satu commit reference** dan mendeklarasikan freeze `apps/web`.

## Commit reference (frozen baseline)

| Field | Nilai |
|---|---|
| Commit | `ec04389c6be728fd606c43f8e8c9b48e6747302a` |
| Short | `ec04389` |
| Branch | `development` |
| Subject | Merge pull request #71 from manikandareas/feat/citation-manager |
| Tanggal commit | 2026-07-13 22:10:05 +0800 |
| Tanggal freeze | 2026-07-14 |

Working tree saat freeze: bersih. Yang berubah pada Phase 0 hanya harness/doc: `docs/apps-svelte-migration-plan.md` (plan) + `docs/migration/**` (harness ini). Tidak ada file `apps/web` yang berubah — sesuai gate Phase 0 ("hanya harness/doc berubah").

Semua porting Svelte di-diff terhadap commit ini. Bila `apps/web` **harus** berubah setelah freeze (mis. security hotfix), catat di [§Freeze exceptions](#freeze-exceptions), update commit reference secara eksplisit, dan pastikan perubahan itu juga diport ke Svelte.

## Kebijakan freeze (§0 #3, §13 "Moving target web")

- `apps/web` = **reference implementation** untuk di-diff saat porting; **bukan** rollback target dengan soak/canary (nol user, §0).
- **Tidak ada** feature work / redesign terjadwal baru di `apps/web` selama migrasi (tanpa dual-maintenance). Perubahan yang diizinkan hanya: security hotfix kritis, dan perbaikan yang **langsung** diport ke Svelte pada saat yang sama.
- `apps/web` dihentikan setelah cutover (§12) dan dihapus di pekerjaan terpisah; disimpan di git sebagai reference sampai keputusan hapus.

## Mengunci commit sebagai tag git (opsional)

Dokumen ini adalah source of truth freeze; gate Phase 0 hanya menuntut commit reference **tercatat**. Bila ingin tag git eksplisit yang bisa di-checkout:

```bash
git tag -a apps-web-freeze -m "apps/web frozen baseline for SvelteKit migration (Phase 0)" ec04389
# push bila perlu dibagikan: git push origin apps-web-freeze
```

## Freeze exceptions

| Tanggal | Commit baru | Alasan | Diport ke Svelte? |
|---|---|---|---|
| — | — | — | — |
