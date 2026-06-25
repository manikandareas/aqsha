# Development dengan Git Worktree

Worktree memungkinkan beberapa branch dibuka sekaligus di folder terpisah, tanpa
`git stash` atau clone ulang. Semua worktree berbagi satu `.git` yang sama, jadi
hemat disk dan history-nya satu.

Yang **tidak** ikut otomatis: file gitignored seperti `.env`. Itu yang di-handle
`scripts/link-env.sh`.

## Quick start

```bash
# 1. Buat worktree untuk branch baru, sejajar dengan folder repo
git worktree add ../aqsha-fitur-x -b feat/fitur-x

# 2. Symlink semua .env dari worktree utama ke worktree baru
cd ../aqsha-fitur-x
/path/ke/aqsha/scripts/link-env.sh        # atau dari mana saja: scripts/link-env.sh .

# 3. Install & jalankan seperti biasa
bun install
bun dev
```

`link-env.sh` cari semua file `.env*` yang gitignored di worktree utama (saat ini
ada 8: `apps/agent-v2`, `apps/agents`, `apps/api-v2`, `apps/web-v2`, `apps/web`,
`packages/convex`, `packages/db`, `packages/services`) lalu bikin symlink ke
worktree target. Symlink = satu sumber kebenaran: edit `.env` di worktree utama,
semua worktree langsung ikut. Idempotent, aman dijalankan ulang.

## Override env per-worktree

Symlink artinya env-nya **sama** di semua worktree. Untuk parallel dev, sering ada
yang harus beda biar dua dev server tidak bentrok:

- **Port** — jalankan dengan override, jangan ubah file: `PORT=3001 bun dev`
- **Database / branch DB** — kalau butuh DB terpisah, jangan symlink file itu.
  Hapus symlink-nya (`rm packages/db/.env`) lalu bikin file lokal sendiri.

`link-env.sh` pakai `ln -sf`, jadi kalau dijalankan ulang akan menimpa lagi file
yang sudah kamu lokalkan — jalankan sekali saja di worktree yang punya override.

## Catatan

- **`bun install` tetap perlu** di tiap worktree — `node_modules` tidak di-share.
- **Convex/eve** punya runtime state lokal (`.eve/`, deploy keys). Untuk parallel
  dev backend, pastikan tiap worktree menunjuk ke deployment yang benar lewat env.
- Worktree tidak boleh checkout branch yang sudah dipakai worktree lain.

## Cleanup

```bash
git worktree remove ../aqsha-fitur-x      # symlink ikut terhapus, file asli aman
git worktree list                         # lihat worktree aktif
git worktree prune                        # bersihkan entri yang foldernya sudah dihapus manual
```
