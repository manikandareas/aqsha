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

## Release invariant — one version string, everywhere

A release is **one version string `X.Y.Z`** that must appear, identically, in every place that records
it. These are never allowed to drift:

| Artifact | Where | Value |
| --- | --- | --- |
| **git tag** (source of truth) | on `main` | `vX.Y.Z` |
| **changelog entry** | `apps/web/content/changelog/*.mdx` frontmatter | `version: "X.Y.Z"` + `publishedAt: "<release date>"` |
| **GitHub Release** | GitHub → Releases | title `vX.Y.Z` (auto from the tag) |
| workspace `package.json` | repo | `X.Y.Z` — informational, not the SoT |

Rules (enforced — see "How sync is enforced" below):

1. **No tag without a matching changelog entry.** Every `vX.Y.Z` tag MUST have a changelog `.mdx` whose
   frontmatter `version` is exactly `X.Y.Z` (the tag minus the `v`).
2. **No changelog `version` that isn't a real tag.** If an entry carries a `version`, that version must
   be (or become, in the same release) a pushed git tag. Entries that are not a release carry **no**
   `version` field (it is optional in the schema precisely for pre-release/undated notes).
3. **Version only increases.** Tags and changelog `version`s are monotonic — never reuse or go backward.
4. **Same date.** The changelog `publishedAt` is the release date, i.e. the day the tag is pushed.

## Release workflow (manual tags)

Work flows `feature branch → PR → development`, and periodically `development → main`. A release is a
tag on `main`, created **together with** its changelog entry so they can't drift:

```bash
# 1. BEFORE tagging: land the changelog entry for this version (via a normal PR into development,
#    then development → main). Frontmatter MUST carry the exact version you will tag:
#      ---
#      title: "<judul rilis, product voice>"
#      publishedAt: "2026-07-12"      # = the day you push the tag
#      version: "0.1.0"               # = the tag without the leading "v"
#      categories: ["baru"]           # baru | peningkatan | perbaikan
#      summary: "<1 kalimat teaser>"
#      ---
#
# 2. Merge the development → main PR (CI gate + build/deploy runs on the push to main).
#
# 3. From an up-to-date main, tag with the SAME X.Y.Z as the changelog `version`, and push:
git checkout main && git pull origin main
git tag -a v0.1.0 -m "v0.1.0 — <one-line summary>"
git push origin v0.1.0
```

Pushing a `vX.Y.Z` tag triggers `.github/workflows/release.yml`, which **first verifies a changelog
entry with `version: "X.Y.Z"` exists** (fails the release if not — rule 1), then creates a **GitHub
Release** with auto-generated notes (the developer-facing changelog). It does **not** rebuild or
redeploy — the push to `main` already shipped the images via `deploy.yml`; the tag only records the release.

> Tip: for a throwaway or preview cut you can mark it as a GitHub pre-release; for normal `0.x`
> production cuts we publish them as regular releases (they are the versions actually running).

## How sync is enforced

- **At tag time (CI):** `release.yml` refuses to publish a release for `vX.Y.Z` unless a changelog entry
  with `version: "X.Y.Z"` exists → you cannot tag without a changelog (rule 1).
- **By convention (review):** the changelog entry lands in the same `development → main` PR as the work
  it describes, so reviewers see the version + notes together before it ships.
- **Spot-check any time:** every git tag should have exactly one changelog `version` and vice-versa —
  ```bash
  git tag --list 'v*' | sed 's/^v//' | sort -u > /tmp/tags.txt
  grep -rho 'version: "[0-9][^"]*"' apps/web/content/changelog | sed 's/version: "//;s/"//' | sort -u > /tmp/cl.txt
  diff /tmp/tags.txt /tmp/cl.txt && echo "tags ↔ changelog in sync"
  ```

## Two changelogs, on purpose

- **Product-facing** — the curated "Apa yang baru" entries in `apps/web/content/changelog/`. Written by
  hand, in product voice, for users. This is the one shown in the app.
- **Developer-facing** — the auto-generated GitHub Release notes (from merged PRs/commits). For the team.

Keep them separate: the GitHub Release is the raw record; the MDX changelog is the human story. The
release-marking entry is the bridge: its `version` field is what ties the human story to the tag.

## Reconciling existing changelog entries (legacy `1.x`)

Some early changelog entries were authored with ad-hoc `version` values like `"1.3.0"` — from **before**
git tags existed, and inconsistent with the `0.x` policy. Since we are only now starting real tags at
`v0.1.0`, those numbers would read as non-monotonic (a `1.3.0` card sitting above a `0.2.0` card).

To make rule 2 hold ("no changelog `version` that isn't a real tag"), **strip the `version` field from
the legacy entries** — they stay as dated changelog cards (they still render; `version` is optional),
they just stop claiming a version that was never tagged. From `v0.1.0` onward, every entry that carries
a `version` has a matching tag. Do this cleanup in its own PR before (or with) the first tag.

## Where the version shows up

- **git tag** `vX.Y.Z` — source of truth.
- **GitHub Release** — created from the tag.
- **GHCR images** — tagged `latest` + `sha-<short>` on every `main` push (`deploy.yml`). The commit SHA
  is baked into each image as the Sentry `release`, so errors already map to an exact build. (Wiring the
  semver into image tags / `APP_VERSION` is a possible later enhancement; not required for the manual flow.)
- The six workspace `package.json` files stay at a nominal `0.1.0` — informational only, not the SoT.
