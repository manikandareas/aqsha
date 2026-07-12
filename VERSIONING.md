# Versioning & Releases

Aqsha follows [Semantic Versioning](https://semver.org) with a **pre-1.0 (`0.y.z`)** policy while the
product is still stabilizing. The **git tag on `main` is the single source of truth** for the product
version — we do not hand-sync the six `package.json` versions (that is a library pattern; Aqsha ships
as an app).

## Scheme — we are on `0.y.z`

`1.0.0` is reserved for the first **stable / GA** release. Until then everything is `0.x` and, per the
SemVer spec for pre-1.0, **breaking changes are allowed on a minor bump**. Bump rules while `0.x`:

| Change | Bump | Example |
| --- | --- | --- |
| New feature, notable change, or breaking change | **minor** | `0.1.0 → 0.2.0` |
| Bug fix or small tweak | **patch** | `0.1.0 → 0.1.1` |

When the app is considered stable, cut `1.0.0` and switch to normal SemVer (breaking → major).

## Release workflow (manual tags)

Work flows `feature branch → PR → development`, and periodically `development → main`. A release is a
tag on `main`:

```bash
# 1. Merge the development → main PR (CI gate + build/deploy runs on the push to main).
# 2. From an up-to-date main, create an annotated tag and push it.
git checkout main && git pull origin main
git tag -a v0.1.0 -m "v0.1.0 — <one-line summary>"
git push origin v0.1.0
```

Pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which creates a **GitHub Release**
with auto-generated notes (the developer-facing changelog). It does **not** rebuild or redeploy — the
push to `main` already shipped the images via `deploy.yml`; the tag only records the release.

> Tip: for a throwaway or preview cut you can mark it as a GitHub pre-release; for normal `0.x`
> production cuts we publish them as regular releases (they are the versions actually running).

## Two changelogs, on purpose

- **Product-facing** — the curated "Apa yang baru" entries in `apps/web/content/changelog/`. Written by
  hand, in product voice, for users. This is the one shown in the app.
- **Developer-facing** — the auto-generated GitHub Release notes (from merged PRs/commits). For the team.

Keep them separate: the GitHub Release is the raw record; the MDX changelog is the human story.

## Where the version shows up

- **git tag** `vX.Y.Z` — source of truth.
- **GitHub Release** — created from the tag.
- **GHCR images** — tagged `latest` + `sha-<short>` on every `main` push (`deploy.yml`). The commit SHA
  is baked into each image as the Sentry `release`, so errors already map to an exact build. (Wiring the
  semver into image tags / `APP_VERSION` is a possible later enhancement; not required for the manual flow.)
- The six workspace `package.json` files stay at a nominal `0.1.0` — informational only, not the SoT.
