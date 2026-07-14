# Reference screenshots — capture manifest (Phase 0 #5)

Screenshot reference `apps/web` (baseline `ec04389`) untuk **eyeball diff** saat porting — **bukan** pixel-gate blocking (§0 #4, §9.3). Yang diperiksa manual: layout jelas melenceng, wrapping/overflow rusak, focus ring hilang, overlay/z-index kacau, animasi kritis patah. Perbedaan minor bukan blocker.

> **Status capture:** BELUM diambil. Capture = tugas owner (§15 #5) karena butuh `apps/web` berjalan + sign-in Clerk test instance untuk surface ter-proteksi. Ini **tidak** memblokir gate Phase 0 (gate hanya menuntut ledger 100% + freeze). Ambil per surface saat memulai phase konsumennya.

## Prosedur capture

1. `bun run dev:web` (build content-collections + Next dev). Public surface tak butuh auth; `/app/**` & `/onboarding` & `/app/settings/**` butuh sign-in test instance.
2. Untuk tiap surface di tabel: light + dark, minimal desktop (1280×800) + mobile (390×844); tambahkan viewport lain untuk surface dengan panel/breakpoint kritis.
3. Simpan ke `docs/migration/screenshots/<phase>/<surface>__<theme>__<viewport>.png` (contoh `p3/app-shell__dark__1280.png`).
4. Untuk state non-default (hover/focus/open/loading/error/empty/panel-expanded), suffix state: `__open`, `__error`, dst.

Matrix §9.3 — viewport: `390×844`, `768×1024`, `1280×800`, `1536×960` + panel expanded/collapsed. State: default/hover/focus/active/disabled/open/loading/error/empty; konten pendek/panjang/CJK; reduced motion. Ambil **secukupnya** (eyeball), tidak wajib kombinasi penuh.

## Surface prioritas (per phase)

| Phase | Surface | URL | Auth | Catatan capture |
|---|---|---|---|---|
| 3 | App shell + sidebar | `/app` | ✅ | collapsed & expanded sidebar; mobile drawer; detail-split. |
| 3 | Theme toggle | `/app` | ✅ | light/dark; anti-flash reload. |
| 4 | Landing | `/` | — | semua section; hover CTA; mobile. |
| 4 | Sign-in / Sign-up | `/sign-in`, `/sign-up` | — | Clerk appearance light/dark. |
| 4 | Blog list + detail | `/blog`, `/blog/[slug]` | — | prose/code/anchor; CJK bila ada. |
| 4 | Changelog list + detail | `/changelog`, `/changelog/[slug]` | — | kategori/tanggal. |
| 5 | Onboarding | `/onboarding` | ✅ | tiap step; progress; validation error. |
| 5 | Settings (7 halaman) | `/app/settings/*` | ✅ | overview/account/appearance/personalization/integrations/security/usage-billing; rail + mobile. |
| 7 | Thread experience | `/app`, `/app/threads/[threadId]` | ✅ | composer + token chip; Lite/Pro; panel Sumber; empty/loading. |
| 7 | `/deep` run | thread + `/deep` | ✅ | plan-gate HITL; stepper; viz; references. |
| 8 | Explore home + reader | `/app/explore`, `/app/explore/[paperRef]`, `/app/explore/n/[id]` | ✅ | bento; card variants; PDF thumb; Ask Astra panel. |
| 9 | Workspaces + library | `/app/workspaces`, `/app/workspaces/[workspaceId]` | ✅ | grid/folder/marquee; upload toast; context menu; panel `chat`/`cite`. |
| 9 | Artifact + PDF reader | `/app/workspaces/[id]/artifacts/[id]` | ✅ | Markdown/Mermaid/PDF; citation panel. |
| 9 | Citation Manager | workspace panel `cite` | ✅ | list/filter/detail; import preview; export. |
| 10 | BlockNote editor | artifact editor | ✅ | toolbar/slash/citation inline+bibliography; AI accept/reject; dark. |

## Alternatif tanpa auth (opsional)

Public surface (Phase 4: landing, sign-in/up, blog, changelog) bisa di-capture via browser automation begitu `dev:web` jalan, tanpa kredensial. Surface `/app/**` menunggu sign-in owner.
