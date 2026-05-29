# Selia UI Migration Phase 0 Baseline

Captured on 2026-05-29 from `http://localhost:3000` with `bun run dev:app`.

## Verification

- `bun install`: passed, no dependency changes.
- `bun run lint`: passed.
- `bun run typecheck`: passed.

## Baseline Data

- Workspace: `ns7f30wd7xes2artkekxbhemjx87jzxd`
- Artifact: `kh7756bmdsjqe14dhdjf73ncz187m8jz`
- Thread: `m5751ayxv8r5z3k1fqeyrq0y1n87ndqq`

## Desktop Screenshots

Captured at `1440x1000`, full page.

- `desktop-01-product-root.png`: `/`
- `desktop-02-explore.png`: `/explore`
- `desktop-03-workspaces-index.png`: `/workspaces`
- `desktop-04-workspace-detail.png`: `/workspaces/ns7f30wd7xes2artkekxbhemjx87jzxd`
- `desktop-05-artifact-detail.png`: `/workspaces/ns7f30wd7xes2artkekxbhemjx87jzxd/artifacts/kh7756bmdsjqe14dhdjf73ncz187m8jz`
- `desktop-06-thread-detail.png`: `/threads/m5751ayxv8r5z3k1fqeyrq0y1n87ndqq`
- `desktop-07-settings-overview.png`: `/settings/overview`
- `desktop-08-settings-account.png`: `/settings/account`
- `desktop-09-settings-appearance.png`: `/settings/appearance`
- `desktop-10-settings-security.png`: `/settings/security`
- `desktop-11-settings-usage-billing.png`: `/settings/usage-billing`

## Mobile Screenshots

Captured at `390x844`, full page.

- `mobile-01-root-sidebar.png`: `/`, sidebar open.
- `mobile-02-workspace-detail-panel.png`: `/workspaces/ns7f30wd7xes2artkekxbhemjx87jzxd`
- `mobile-03-settings-overview.png`: `/settings/overview`

## Auth Gate Check

Unauthenticated `curl -I` checks confirmed Clerk protected-route redirects:

- `/workspaces` -> `307 Temporary Redirect` to `/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fworkspaces`
- `/settings/overview` -> `307 Temporary Redirect` to `/sign-in?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Fsettings%2Foverview`

Both responses included `x-clerk-auth-status: signed-out`.
