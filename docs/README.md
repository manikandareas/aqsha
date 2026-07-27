# Docs — Aqsha

Indeks dokumentasi monorepo. File disusun per domain; nama file memakai **kebab-case** dengan suffix tipe (`-plan`, `-audit`, `-spec`, `-adr`, `-runbook`, `-prd`).

## Struktur

| Folder | Isi |
|---|---|
| [`product/`](product/) | Arah produk research-first, product spec Astra, versioning/changelog editorial |
| [`architecture/`](architecture/) | Blueprint stack V2 (`00`–`06`) |
| [`migration/`](migration/) | Migrasi Svelte (`svelte-plan.md` + harness + decision records) |
| [`agent/`](agent/) | Audit & plan Astra yang masih aktif |
| [`features/`](features/) | Citations, statistics |
| [`ops/`](ops/) | Observability/CI, secrets (Infisical) |

## Konvensi penamaan

- **Folder:** kebab-case, satu domain per folder.
- **File:** kebab-case; jangan ulangi nama folder di nama file bila konteks sudah jelas.
- **Tanggal:** suffix `YYYY-MM-DD` hanya untuk audit/temuan bertanggal.
- **Tipe dokumen:** `-plan`, `-audit`, `-research`, `-spec`, `-adr`, `-runbook`, `-prd`, `-catalog`.

## Entry point yang sering dipakai

| Butuh | Baca |
|---|---|
| Arah produk (research-first, branch Svelte) | [`product/research-first-product-direction.md`](product/research-first-product-direction.md) |
| Blueprint teknis | [`architecture/00-overview.md`](architecture/00-overview.md) |
| Migrasi Svelte | [`migration/svelte-plan.md`](migration/svelte-plan.md) + [`migration/README.md`](migration/README.md) |
| Spec Astra | [`product/astra-agent-spec.md`](product/astra-agent-spec.md) |
| Changelog / bump versi | [`product/versioning-and-changelog.md`](product/versioning-and-changelog.md) (kebijakan tag: root `VERSIONING.md`) |
| Observability produksi | [`ops/observability/cicd-runbook.md`](ops/observability/cicd-runbook.md) |
| Secrets | [`ops/secrets/infisical-strategy.md`](ops/secrets/infisical-strategy.md) |
