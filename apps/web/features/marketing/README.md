# DO NOT EDIT — canonical marketing is `@aqsha/www`

**Kill switch date:** 2026-07-18

The public marketing surface (landing, blog, changelog) lives in `apps/www`
(Astro → Cloudflare Pages at `aqshara.com`).

This folder is a **frozen leftover** for product-app chrome that still imports
header/footer on legacy blog/changelog routes under `apps/web`. Do not update
copy, pricing, sections, or motion here.

- Edit marketing in: `apps/www/`
- Landing `/` on web redirects to `NEXT_PUBLIC_SITE_URL` (default `https://aqshara.com`)
- Delete this tree once blog/changelog cutover on web is complete
