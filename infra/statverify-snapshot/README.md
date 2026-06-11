# statverify snapshot

Pre-baked Daytona sandbox image for the Aqsha **statistical verification engine**
(Astra Phase 1). It bundles the R + Python stack so the Convex runner can
recompute statistics inside an ephemeral Daytona sandbox with **no network
access** — this account's Daytona tier blocks sandbox egress, so nothing can be
installed at runtime.

This is infrastructure, not a workspace package — it has no JS and is
intentionally **not** in the bun `workspaces` list.

## What's here

| File | Purpose |
|---|---|
| `Dockerfile` | The image: `r-base:4.4.1` + statcheck, scrutiny, rsprite2, metafor, pwr, jsonlite (R) + scipy, statsmodels, pandas, numpy, pingouin (Python). |
| `VERSION` | Snapshot version (`v1`). Drives the image tag and the recommended Daytona snapshot name. Bump it when the deps change. |
| `smoke-test.R` | Loads every R library and runs a tiny statcheck / GRIM / power check. |
| `compose.yaml` | **Local smoke-test only** (Daytona does not use compose). |
| `../../.github/workflows/statverify-snapshot.yml` | CI: build the image and push it to GHCR on changes here. |

## Flow

```
edit Dockerfile / deps  ──▶  CI builds + pushes image to GHCR
                                      │
                                      ▼
                        daytona snapshot create  (one-time, from the GHCR image)
                                      │
                                      ▼
              set DAYTONA_STATVERIFY_SNAPSHOT on the Convex deployment
                                      │
                                      ▼
   packages/convex .../sandbox/sandboxRunner.ts  ──▶  daytona.create({ snapshot })
```

## 1. Local smoke-test (optional, before pushing)

```bash
docker compose -f infra/statverify-snapshot/compose.yaml up --build
```

Exit code `0` means the R + Python verification stack loads and runs. (First
build is slow — R compiles several packages from source.)

## 2. CI build + push to GHCR

`.github/workflows/statverify-snapshot.yml` runs on any change under
`infra/statverify-snapshot/**` (or via **Run workflow**). It pushes:

- `ghcr.io/manikandareas/aqsha-statverify:v1` (the `VERSION` tag)
- `ghcr.io/manikandareas/aqsha-statverify:<commit-sha>`
- `ghcr.io/manikandareas/aqsha-statverify:latest`

Auth uses the built-in `GITHUB_TOKEN` (`packages: write`) — no extra secrets.

## 3. Create the Daytona snapshot (one-time per version)

**Option A — from the GHCR image** (what CI produces; reproducible):

```bash
daytona snapshot create aqsha-statverify-v1 \
  --image ghcr.io/manikandareas/aqsha-statverify:v1 \
  --cpu 1 --memory 2 --disk 4
```

For Daytona to pull it, either make the GHCR package **public**
(repo → Packages → Package settings → Change visibility), or add **GHCR registry
credentials** in the Daytona dashboard (Registries → GitHub Container Registry).

**Option B — let Daytona build from the Dockerfile** (no registry, but no CI/GHA
caching, and you must run it from this directory):

```bash
cd infra/statverify-snapshot
daytona snapshot create aqsha-statverify-v1 --dockerfile ./Dockerfile --cpu 1 --memory 2 --disk 4
```

## 4. Point the backend at the snapshot

On the Convex deployment, set:

```
DAYTONA_STATVERIFY_SNAPSHOT=aqsha-statverify-v1
DAYTONA_API_KEY=<your key>
```

The runner records `sandboxRuns.snapshotVersion` from this value, so a versioned
name (`-v1`, `-v2`, …) keeps every run reproducible. Until it's set,
`runStatVerification` returns `{ status: "not_configured" }` and the verify tools
degrade gracefully.

## Bumping the snapshot

1. Edit `Dockerfile` (add/upgrade a dependency).
2. Bump `VERSION` (`v1` → `v2`).
3. Merge → CI pushes `:v2`.
4. `daytona snapshot create aqsha-statverify-v2 --image ...:v2 ...`.
5. Update `DAYTONA_STATVERIFY_SNAPSHOT=aqsha-statverify-v2`.

## Notes / future

- **Reproducibility:** R packages are installed from CRAN at build time
  (unpinned), so versions can drift across rebuilds. For stricter reproducibility,
  switch the `repos=` to a dated Posit Package Manager snapshot.
- **Automating step 3:** the create-snapshot call can be added as a CI job
  (guarded on a `DAYTONA_API_KEY` secret) once the Daytona CLI headless-auth flow
  is confirmed; left manual here to avoid shipping an unverified deploy step.
