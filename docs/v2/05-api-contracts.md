# Aqsha V2 — API Contracts (Request / Response)

> Kontrak request/response untuk **setiap** endpoint V2, di-*ground* langsung dari fungsi Convex V1 yang sebenarnya (`packages/convex`), plus pemetaan agent runtime ke **eve**. Baca [02-api-domains.md](02-api-domains.md) untuk peta domain & runtime split, dan [04-service-layer.md](04-service-layer.md) untuk service yang menangani tiap endpoint.

Dokumen ini adalah sumber kebenaran untuk shape data di boundary API. Field name diambil persis dari schema/validator V1 supaya kontrak ke frontend tidak berubah saat cutover.

## Konvensi Global

**Base URL & versi.** REST API (Elysia) di `apps/api-v2`, di-*type* via Eden Treaty (`@aqsha/api-v2` → `apps/web-v2`). Tidak ada prefix `/v1` di REST kita (versioning lewat deploy). Endpoint agent (Domain 7) di-mount oleh **eve** lewat `withEve()` di `apps/web-v2` dan dikonsumsi `useEveAgent()` — bukan route Elysia.

**Auth.**
- `Clerk JWT required` — header `Authorization: Bearer <clerk-session-token>`. Plugin auth memverifikasi token, lalu menurunkan `ownerUserId == identity.tokenIdentifier` dan `clerkUserId == identity.subject`. Tanpa token → `401`.
- `webhook signature` — diverifikasi via svix/`standardwebhooks` (Clerk) atau Polar SDK; tidak pakai Clerk JWT.
- `admin` — `ownerUserId`/email ada di allowlist env (`adminEntitlements`).
- `in-process` (Domain 7 eve tools) — bukan HTTP route; owner diturunkan dari `ctx.session` eve. Didokumentasikan untuk kelengkapan kontrak tool.

**Timestamp.** Semua waktu adalah epoch milidetik (`number`), mengikuti semantik Convex `_creationTime`. Di PG disimpan `bigint` epoch-ms agar nilai di kontrak identik dengan V1.

**Error.** Semua error terstruktur memakai shape `lib/appError.ts`:
```ts
type AppError = { message: string; code: string; severity?: "info" | "warning" | "error"; field?: string };
```
Error umum (berlaku di semua endpoint ber-auth, tidak diulang per-endpoint kecuali relevan):
- `401` `{ message: "Unauthenticated", code: "unauthenticated" }` — tidak ada/invalid Bearer.
- `409` `{ message: "...", code: "user_not_synced" }` — JWT valid tapi belum ada row `users` (panggil `POST /users/me/sync` dulu).
- `429` `{ message: "...", code: "rate_limited", severity: "info" }` + body `{ retryAt }` — rate-limit terlampaui.
- `500` `{ code: "internal" }` — error tak terduga (pesan aman, detail di log).

**Return-union (BUKAN throw).** Mengikuti invariant V1, hasil produk tertentu dikembalikan sebagai body (status `200`/`402`), bukan exception, supaya UI bisa render state-nya:
```ts
// send-message / agent run gate
type SendResult =
  | { ok: true; threadId: string; runId: string }
  | { ok: false; reason: "rate_limited" | "quota_exceeded" | "subscription_required" | "billing_inactive" | "reply_in_progress"; retryAt?: number };
// billing entitlement
type EntitlementResult = { ok: true } | { ok: false; reason: "quota_exceeded" | "subscription_required" | "billing_inactive" };
```

**Pagination.** List besar pakai keyset cursor (mengganti Convex `paginate()`):
```ts
type Paginated<T> = { items: T[]; nextCursor: string | null }; // nextCursor null = halaman terakhir
// Query umum: ?cursor=<opaque>&limit=<n>
```

**Upload file (R2).** Pola tiga-langkah, mengganti `ctx.storage` Convex (lihat [01-tech-stack.md](01-tech-stack.md)):
1. `POST .../upload-url` → `{ uploadUrl, key }` (R2 presigned PUT via `@aws-sdk/s3-request-presigner`).
2. Client `PUT uploadUrl` dengan byte file langsung ke R2 (tanpa lewat API).
3. `POST .../finalize|upload` dengan `{ key, fileName, mimeType, size }` → API memvalidasi, membuat record, dan men-*queue* worker (extraction/index).

**`(deferred)`** pada judul endpoint = di luar core cutover minimal; boleh menyusul setelah subset utama domainnya jalan (lihat [06-implementation-phases.md](06-implementation-phases.md)).

> **Caveat eve.** Kontrak channel eve di bawah sudah direkonsiliasi terhadap **eve 0.11.6** docs (`sessions-runs-and-streaming.md`, `auth-and-route-protection.md`): route `POST /eve/v1/session`, `POST /eve/v1/session/:sessionId`, `GET /eve/v1/session/:sessionId/stream` (+ `GET /eve/v1/health` publik, `GET /eve/v1/info`), reconnect via `?startIndex=<eventCount>`, header `x-eve-session-id`, `continuationToken` sebagai resume handle, frame NDJSON native (lihat stream endpoint), auth via ordered auth-walk + custom `AuthFn`. eve **belum ter-install di repo ini** — pin versi & re-verifikasi terhadap `node_modules/eve/docs` saat install (API beta bisa berubah). Tool eve in-process bukan HTTP route. Cancellation bukan route channel yang terdokumentasi (lihat catatan di bawah).

---

## Auth & Users

Tier 1 — Foundation · runtime: Elysia (Bun) · all REST (no eve-owned endpoints in this domain).

Conventions for this domain:
- **Owner key**: `ownerUserId` == Clerk `identity.tokenIdentifier`; `clerkUserId` == Clerk `identity.subject`. The two-column split is preserved on the PG `users` table.
- The current-user `id` field returned to clients is `ownerUserId` (V1 returns `user._id`, which the repository sets to `ownerUserId` — see `currentUserFromDoc`/`currentUserFromIdentity`).
- Avatar storage migrates from the Convex sentinel `image = "storage:<storageId>"` (`AVATAR_STORAGE_PREFIX`) to an R2 object key; reads resolve to a presigned/served URL via `resolveUserImage` → `UserService.resolveUserImage`.
- Structured errors use `{ message, code, severity?, field? }` (from `lib/appError.ts`). Auth-missing maps to `401` (V1 throws plain `Error("Unauthenticated")`).
- Webhook idempotency: V1 `authEvents.by_event_key` dedupe → Redis `SETNX` + TTL keyed on `eventId`.

---

### POST /webhooks/clerk
- Auth: webhook signature (svix / `standardwebhooks` `Webhook(CLERK_WEBHOOK_SIGNING_SECRET).verify`)
- Rate limit: none (idempotency-guarded instead)
- Service: `UserService.processClerkWebhook()` (V1 `auth.processClerkWebhook` → `auth/webhooks.processClerkWebhook`); on `user.deleted` delegates to `AccountDeletionService.cleanupUserOwnedData`
- Path params / Query: none
- Request body: raw Clerk event JSON, svix-verified before parse. Verified shape narrowed to:
```ts
const ClerkWebhookEvent = z.object({
  id: z.string().optional(),           // -> eventId (falls back to `${type}:${clerkUserId}`)
  type: z.string(),                    // only `user.*` processed; others ignored (200 ok)
  data: z.object({
    id: z.string(),                    // clerkUserId (required; else 400)
    email_addresses: z
      .array(z.object({ id: z.string(), email_address: z.string() }))
      .optional(),
    primary_email_address_id: z.string().nullable().optional(),
    deleted: z.boolean().optional(),
  }),
});
// Normalized internally to: { eventId, eventType, clerkUserId, email: string | null, deleted: boolean }
// deleted = (type === "user.deleted") || data.deleted === true
// email = primary-matched email_address, else first, else null
```
- Response 200:
```ts
// signature ok + user.* dispatched:
{ ok: true }
// non-user.* event:
{ ok: true, ignored: true }
// (internal processClerkWebhook returns { processed: boolean }; processed=false on Redis-SETNX dedupe hit)
```
- Errors:
  - `500` `{ message: "CLERK_WEBHOOK_SIGNING_SECRET is not configured.", code: "clerk_webhook_secret_missing", severity: "error" }`
  - `400` `{ message: "Invalid Clerk webhook signature.", code: "clerk_webhook_invalid_signature" }` (on `WebhookVerificationError`)
  - `400` `{ message: "Clerk webhook payload is missing user id.", code: "clerk_webhook_missing_user_id" }`

---

### POST /users/me/sync
- Auth: Clerk JWT required
- Rate limit: none
- Service: `UserService.ensureCurrentUser()` (V1 `auth.syncCurrentUser` → `auth/profile.syncCurrentUser` → `ensureCurrentUser`); also calls `WorkspaceService.ensureDefaultWorkspaceForOwner(ownerUserId)` cold-start (runs on every sync — idempotent)
- Path params / Query: none
- Request body: none
```ts
const SyncCurrentUserBody = z.void();
```
- Response 200:
```ts
{
  id: string;          // ownerUserId (== identity.tokenIdentifier)
  clerkUserId: string; // identity.subject
}
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }` (V1 `getAuthenticatedIdentity` throws when no identity)

---

### GET /users/me
- Auth: Clerk JWT required
- Rate limit: none
- Service: `UserService.getCurrentUserProfile()` (V1 `auth.getCurrentUser` → `getCurrentUserProfile` → `requireCurrentUser` + `resolveUserImage`). Also consumed internally by `BillingService.getUserInfo` for Polar.
- Path params / Query: none
- Request body: none
- Response 200:
```ts
{
  id: string;                  // ownerUserId
  name: string | null;         // users.name, falls back to identity.name
  email: string | null;        // users.email, falls back to identity.email
  emailVerified: boolean;      // users.emailVerified ?? identity.emailVerified === true
  image: string | null;        // R2-resolved avatar URL (resolveUserImage); raw URL passthrough if not an R2 key
}
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `409` `{ message: "Authenticated user has not been synced.", code: "user_not_synced" }` (V1 throws when a JWT is present but no `users` row exists yet; client should call `POST /users/me/sync` first)

---

### PATCH /users/me
- Auth: Clerk JWT required
- Rate limit: none
- Service: `UserService.updateDisplayName()` (V1 `auth.updateDisplayName` → `auth/profile.updateDisplayName`; trims, 120-char max via `maxDisplayNameLength`, patches `users.name` + `users.updatedAt`)
- Path params / Query: none
- Request body:
```ts
const UpdateDisplayNameBody = z.object({
  name: z.string(), // trimmed server-side; non-empty after trim; max 120 chars
});
```
- Response 200:
```ts
{ ok: true } // V1 returns null; expose { ok: true } for a consistent REST body
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `400` `{ message: "Nama tampilan tidak boleh kosong.", code: "display_name_required", field: "name" }`
  - `400` `{ message: "Nama tampilan maksimal 120 karakter.", code: "display_name_too_long", field: "name" }`

---

### POST /users/me/avatar/upload-url  *(deferred)*
- Auth: Clerk JWT required
- Rate limit: none
- Service: `UserService.generateAvatarUploadUrl()` (V1 `auth.generateAvatarUploadUrl` → `ctx.storage.generateUploadUrl()`); V2 produces an R2 presigned PUT via `@aws-sdk/s3-request-presigner`
- Path params / Query: none
- Request body:
```ts
const AvatarUploadUrlBody = z.object({
  contentType: z.string(),   // e.g. "image/png" — must start with "image/"
  byteSize: z.number().int().positive().max(5 * 1024 * 1024), // 5 MB cap (maxAvatarBytes)
});
```
- Response 200:
```ts
{
  uploadUrl: string;  // R2 presigned PUT URL (client PUTs the file bytes directly)
  key: string;        // R2 object key to pass back to PUT /users/me/avatar
}
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `400` `{ message: "Avatar harus berupa gambar.", code: "avatar_invalid_content_type", field: "contentType" }`
  - `400` `{ message: "Ukuran avatar maksimal 5 MB.", code: "avatar_too_large", field: "byteSize" }`

---

### PUT /users/me/avatar  *(deferred)*
- Auth: Clerk JWT required
- Rate limit: none
- Service: `UserService.setAvatarFromStorage()` (V1 `auth.setAvatarFromStorage` → `auth/profile.setAvatarFromStorage`; validates via `assertAvatarStorageFile` — content-type `image/*` + ≤ 5 MB — stores key in `users.image`, GCs previous object via `deleteAvatarStorageIfPresent`)
- Path params / Query: none
- Request body:
```ts
const SetAvatarBody = z.object({
  key: z.string(), // R2 object key from POST /users/me/avatar/upload-url (replaces v.id("_storage"))
});
```
- Response 200:
```ts
{
  ok: true;          // V1 returns null
  image: string;     // resolved presigned/served R2 avatar URL (post-promote, for immediate UI refresh)
}
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `404` `{ message: "File avatar tidak ditemukan.", code: "avatar_storage_missing", field: "key" }`
  - `400` `{ message: "Avatar harus berupa gambar.", code: "avatar_invalid_content_type", field: "key" }`
  - `400` `{ message: "Ukuran avatar maksimal 5 MB.", code: "avatar_too_large", field: "key" }`

---

### DELETE /users/me
- Auth: Clerk JWT required
- Rate limit: none
- Service: `AccountDeletionService.deleteCurrentAccount()` (V1 `auth.deleteCurrentAccount` action → internal `cleanupOwnerUserDataForDeletion` → `auth/accountDeletion.cleanupOwnerUserData` → `accountCleanup.cleanupUserOwnedData`, then Clerk REST `DELETE /v1/users/:id`). V2 enqueues the heavy cascade to a BullMQ account-deletion worker (widen to cover `userOnboarding`/`userFeedInterests`/`hiddenFeedItems`/`feedInteractions`/`usageDailyRollup`; drop the 500-row hard cap in favour of FK cascade / paginated worker). State machine writes `users.deletionStatus` `deleting` → `deleted` (or `failed` with `deletionFailureReason`), plus `deletionRequestedAt`/`deletionCompletedAt`/`deletionFailedAt`/`deletedAt`; the tombstone `users` row is retained.
- Path params / Query: none
- Request body: none
```ts
const DeleteAccountBody = z.void();
```
- Response 200:
```ts
{
  ownerUserId: string;
  deletedRows: number;           // mergeCleanupResults across agent/artifacts/workspaces/billing cascades
  deletedStorageObjects: number; // R2 objects GC'd (avatar + artifact/extraction/url blobs)
  deletedAgentThreads: number;
}
// V2 async variant (worker-backed): { ownerUserId, deletionStatus: "deleting", accepted: true }
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `500` `{ message: "CLERK_SECRET_KEY is not configured in Convex.", code: "clerk_secret_missing", severity: "error" }` → V2: `clerk_secret_missing` (re-message to drop "in Convex")
  - `502` `{ message: "Failed to delete Clerk user (<status>).", code: "clerk_user_delete_failed", severity: "error" }` (on Clerk REST non-OK, non-404; cascade already ran, `users.deletionStatus` set to `failed` with the reason, re-thrown)

---

Notes carried into V2 (not endpoints):
- `users` columns mirror V1 schema exactly: `ownerUserId`, `clerkUserId`, `email` (nullable), `emailVerified`, `name` (nullable), `image` (nullable), `deletedAt`, `deletionStatus` (`deleting`|`deleted`|`failed`), `deletionRequestedAt`, `deletionCompletedAt`, `deletionFailedAt`, `deletionFailureReason`, `createdAt`, `updatedAt`. Indexes `by_owner_user_id [ownerUserId]`, `by_clerk_user_id [clerkUserId]`.
- `UserService.ensureCurrentUser` is the provisioning seam shared by `POST /users/me/sync` (HTTP) and eve channel auth (maps Clerk JWT → `ownerUserId`); on first insert it sets `name:null`, `image:null`, `emailVerified: identity.emailVerified === true`, and calls `WorkspaceService.ensureDefaultWorkspaceForOwner`.
- `authEvents` (`eventKey`, `eventType`, `clerkUserId`, `processedAt`) becomes Redis `SETNX`+TTL keyed on `eventId`; no PG table required.

## Onboarding & Interests

Tier 1 — Foundation · runtime: Elysia (Bun) · all REST.

Konvensi domain:
- Wizard 3 langkah wajib (background → interests → source), client + server gating (lihat memory onboarding). Diselesaikan sekali; `completedAt` adalah gerbangnya.
- `complete` menyemai sinyal interest feed via `InterestService.seedInterests(topicsForInterestFields(interests), floorWeight=2)` (idempotent). Taksonomi `INTEREST_FIELD_TOPICS` (`feed/interestKeywords.ts`) adalah reference data bersama (dipakai feed scoring + explore seed).
- **Tidak ada** CRUD interest mandiri di V1 — interest hanya di-set saat onboarding lalu bergerak implisit lewat sinyal save/hide feed. Draft lama `GET/PUT /users/me/interests` **di-drop**.

---

### GET /onboarding/status
- Auth: Clerk JWT required (soft — TIDAK mensyaratkan row `users` ter-sync; dipakai server-side redirect `/app` + client safety net)
- Rate limit: none
- Service: `OnboardingService.getStatus()` (V1 `onboarding.getStatus`)
- Path params / Query: none
- Request body: none
- Response 200:
```ts
{ completed: boolean } // Boolean(user_onboarding.completedAt)
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`

---

### POST /onboarding/complete
- Auth: Clerk JWT required
- Rate limit: none
- Service: `OnboardingService.complete()` (V1 `onboarding.complete` → `feed.interests.seedFeedInterests` + `topicsForInterestFields`); memanggil `UserService.ensureCurrentUser` (self-heal) lebih dulu.
- Path params / Query: none
- Request body:
```ts
const CompleteOnboardingBody = z.object({
  background: z.string(),                 // salah satu BACKGROUND_IDS
  interests: z.array(z.string()).min(3),  // >= MIN_INTERESTS (3) interest-field id
  heardAboutSource: z.string(),           // salah satu SOURCE_IDS
  heardAboutOther: z.string().optional(), // wajib bila heardAboutSource === "lainnya"
});
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - `401` `{ message: "Unauthenticated", code: "unauthenticated" }`
  - `400` `{ message: "Latar belakang tidak valid.", code: "onboarding_background_invalid", field: "background" }`
  - `400` `{ message: "Pilih minimal 3 minat.", code: "interests_too_few", field: "interests" }`
  - `400` `{ message: "Sumber tidak valid.", code: "source_invalid", field: "heardAboutSource" }`
  - `400` `{ message: "Mohon isi sumber lainnya.", code: "source_other_required", field: "heardAboutOther" }`

---

## Billing & Subscriptions

> Polar stays the billing provider, re-implemented behind `BillingService` via the Polar SDK directly (replacing the `@convex-dev/polar` component). The `billing_subscriptions` PG row is the SoT fallback for snapshots when live Polar is unavailable (V1: `getLatestMirroredSubscription`). The critical shared write path is `BillingService.consumeCredits` — callable by eve agent runs, feed AI actions, and BullMQ workers — which atomically bumps `billing_credit_periods` + inserts `provider_usage_ledger` + upserts `usage_daily_rollup` **in one transaction** (V1 invariant, preserve). Quota blocks are a **return union** (`{ ok: false, reason }`), never a throw. Webhook idempotency (`billingEvents.by_event_key`) moves to Redis `SETNX`+TTL keyed on `eventKey`. Plan catalog (`catalog.ts`) is the pricing SSOT and moves to a `packages/db` seed/const. Admin override via env allowlists (`AQSHA_ADMIN_OWNER_USER_IDS` / `AQSHA_ADMIN_EMAILS` / `AQSHA_ADMIN_CLERK_USER_IDS`) + the `admin_entitlements` table.

Shared types referenced below (real V1 sources):

```ts
// catalog.ts
type PlanKey = "free" | "starter" | "plus" | "admin";
type PublicPlanKey = "free" | "starter" | "plus";
type ProductKey = "starterMonthly" | "starterYearly" | "plusMonthly" | "plusYearly";
type BillingInterval = "month" | "year";
type CreditFeature =
  | "normal_chat" | "pro_chat" | "cited_answer" | "deep_research"
  | "external_search" | "sandbox_compute" | "citation_verify";
// usageShape.ts featureCountValidator (sandbox_compute/citation_verify optional)
type FeatureCounts = {
  normal_chat: number; pro_chat: number; cited_answer: number;
  deep_research: number; external_search: number;
  sandbox_compute?: number; citation_verify?: number;
};
```

---

### POST /webhooks/polar
- Auth: webhook signature (Polar/standardwebhooks `Webhook(...).verify` over the raw body + `webhook-id`/`webhook-timestamp`/`webhook-signature` headers — V1 `polar.registerRoutes` at `/polar/events`)
- Rate limit: none
- Service: `BillingService.syncSubscriptionFromPolar()` (V1 `internal.billing.entitlements.syncSubscriptionFromPolar`); dispatched per event type by `subscriptionEventPayload(eventType, data)` in `http.ts`
- Path params / Query: none
- Request body: raw Polar event envelope (verified, not parsed by Zod before signature check). Handled event types: `subscription.created`, `subscription.updated`. After verification the handler derives the service payload:

```ts
// derived from event.data (V1 SubscriptionEventData) -> syncSubscriptionFromPolar args
const SyncSubscriptionPayload = z.object({
  // eventKey = `${eventType}:${data.id}:${String(data.currentPeriodEnd ?? "")}:${data.status}`
  eventKey: z.string(),                       // Redis SETNX dedupe key (was billingEvents.by_event_key)
  eventType: z.enum(["subscription.created", "subscription.updated"]),
  ownerUserId: z.string(),                    // REQUIRED — from metadata.userId (throws if missing)
  polarSubscriptionId: z.string(),            // data.id
  polarProductId: z.string(),                 // data.productId
  productKey: z.string().optional(),          // metadata.productKey (starterMonthly|...) — resolves planKey
  status: z.string(),                         // raw Polar status string
  currentPeriodStart: z.number().optional(),  // epoch ms
  currentPeriodEnd: z.number().optional(),    // epoch ms
  cancelAtPeriodEnd: z.boolean().optional(),
  canceledAt: z.number().optional(),          // epoch ms
  rawJson: z.string().optional(),             // JSON.stringify(data) -> billing_subscriptions.raw_json (jsonb)
});
```

- Response 200:

```ts
// HTTP 200 acknowledgement to Polar
type Response = { ok: true; deduped: boolean };
// deduped:true => eventKey already seen (Redis SETNX returned existing); upsert by polar_subscription_id otherwise
```

- Errors:
  - `400` `{ message: "Invalid Polar webhook signature.", code: "billing_webhook_signature_invalid", severity: "error" }`
  - `400` `{ message: "Polar subscription event is missing metadata.userId", code: "billing_event_missing_owner", severity: "error" }`
  - `422` `{ message: "Unknown Polar product for subscription", code: "billing_subscription_product_unknown", severity: "error" }` — when `productKey` resolves to `free`/`admin` plan (V1 `throwAppError`)
  - `500` `{ message: "POLAR_WEBHOOK_SECRET is not configured.", code: "billing_webhook_secret_missing", severity: "error" }`

---

### GET /billing/current
- Auth: Clerk JWT required
- Rate limit: none
- Service: `BillingService.getBillingSnapshot()` + `BillingService.ensureCreditPeriod()` (V1 `billing.current.get`)
- Path params / Query: none
- Request body: none
- Response 200:

```ts
type Response = {
  planKey: "free" | "starter" | "plus" | "admin";
  planLabel: string;                       // PLAN_CATALOG[planKey].label
  status: string;                          // normalized Polar/billing status
  productKey: string | null;               // starterMonthly | starterYearly | plusMonthly | plusYearly | null
  billingInterval: "month" | "year" | null;
  currentPeriodStart: number | null;       // epoch ms
  currentPeriodEnd: number | null;         // epoch ms
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;               // epoch ms
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  billingPortalAvailable: boolean;
  canChangeSubscription: boolean;
  canCancelSubscription: boolean;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;                // max(0, creditsLimit - creditsUsed)
  resetAt: number;                         // epoch ms (currentMonthPeriod end)
  providerSpendCeilingCents: number;       // billing_credit_periods.spend_ceiling_cents
  estimatedCostCents: number;              // billing_credit_periods.estimated_cost_cents
};
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }` (no synced user / `requireCurrentUser` fails)

---

### GET /billing/plans
- Auth: public (no auth — V1 `billing.products.list` takes no user)
- Rate limit: none
- Service: `BillingService.listPlans()` (V1 `billing.products.list`), reads `PLAN_CATALOG` + `PRODUCT_CATALOG` + `configuredProductId`
- Path params / Query: none
- Request body: none
- Response 200:

```ts
type Plan = {
  key: "free" | "starter" | "plus";        // PUBLIC_PLAN_KEYS (admin excluded)
  label: string;
  monthlyPriceIdr: number;
  annualPriceIdr: number;
  monthlyCredits: number;
  deepResearchRuns: number;
  workspaceLimit: number;
  libraryItemLimit: number;
  providerSpendCeilingCents: number;
  features: string[];
  products: Array<{                         // [] for the free plan
    key: "starterMonthly" | "starterYearly" | "plusMonthly" | "plusYearly";
    polarProductId: string | null;         // configuredProductId(key)
    interval: "month" | "year";
    displayPriceIdr: number;
    configured: boolean;                    // Boolean(polarProductId)
  }>;
};
type Response = Plan[];
```

- Errors: none (public, deterministic from in-memory catalog)

---

### GET /billing/usage/activity
- Auth: Clerk JWT required
- Rate limit: none
- Service: `BillingService.getUsageActivity()` (V1 `billing.usage.activity`), reads `usage_daily_rollup` over the `by_owner_date` index
- Path params / Query:

```ts
const Query = z.object({
  days: z.coerce.number().int().optional(), // clamped max(1, min(366, floor(days ?? 365)))
});
```

- Request body: none
- Response 200: every UTC day in the window is filled (zero rows for days with no usage); array ordered chronologically:

```ts
type UsageDay = {
  date: string;                 // "YYYY-MM-DD" UTC (lexicographic == chronological)
  credits: number;
  estimatedCostCents: number;
  eventCount: number;
  featureCounts: {              // featureCountValidator; optional keys coalesced to 0 on read
    normal_chat: number;
    pro_chat: number;
    cited_answer: number;
    deep_research: number;
    external_search: number;
    sandbox_compute?: number;
    citation_verify?: number;
  };
};
type Response = UsageDay[];
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`

---

### GET /billing/usage/current-period  *(deferred — overlaps `/billing/current`; keep as a thin projection or fold in)*
- Auth: Clerk JWT required
- Rate limit: none
- Service: `BillingService.getCurrentPeriod()` (V1 `billing.usage.getCurrentPeriod`) — `getBillingSnapshot` + `ensureCreditPeriod`
- Path params / Query: none
- Request body: none
- Response 200:

```ts
type Response = {
  periodKey: string;            // e.g. "2026-06" (currentMonthPeriod().key)
  planKey: "free" | "starter" | "plus" | "admin";
  isAdmin: boolean;
  isUnlimitedCredits: boolean;
  creditsLimit: number;
  creditsUsed: number;
  creditsRemaining: number;     // max(0, creditsLimit - creditsUsed)
  estimatedCostCents: number;
  spendCeilingCents: number;
  resetAt: number;              // epoch ms
};
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`

---

### POST /billing/checkout
- Auth: Clerk JWT required (resolves `getPolarUserInfo` → `userId` + `email`)
- Rate limit: none
- Service: `BillingService.createCheckout()` (V1 `billing.checkout.create` → `polar.createCheckoutSession`)
- Path params / Query: none
- Request body:

```ts
const Body = z.object({
  productKey: z.enum(["starterMonthly", "starterYearly", "plusMonthly", "plusYearly"]),
  origin: z.string(),       // V1 args.origin
  successUrl: z.string(),   // V1 args.successUrl
});
// metadata set on the Polar session for the webhook to attribute the row:
//   { userId, productKey, planKey, interval }
```

- Response 200:

```ts
type Response = { url: string };   // Polar hosted checkout URL
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - `400` `{ message: "A verified email is required for billing", code: "billing_email_required", severity: "error", field: "email" }` (no `user.email`)
  - `400` `{ message: "Polar checkout requires a real email domain. Update your account email before subscribing.", code: "billing_email_invalid", severity: "error", field: "email" }` (reserved domains: `localhost`, `*.local`, `*.localhost`, `*.test`, `*.invalid`, `*.example`)
  - `400` `{ message: "Unknown billing product", code: "billing_product_unknown", severity: "error" }`
  - `400` `{ message: "Polar product is not configured", code: "billing_product_not_configured", severity: "error" }` (no `configuredProductId`)

---

### POST /billing/portal
- Auth: Clerk JWT required (`getPolarUserInfo`)
- Rate limit: none
- Service: `BillingService.createPortalSession()` (V1 `billing.portal.create` → `polar.createCustomerPortalSession`)
- Path params / Query: none
- Request body:

```ts
const Body = z.object({
  returnUrl: z.string().optional(),   // V1 args.returnUrl
});
```

- Response 200:

```ts
type Response = { url: string };   // Polar customer-portal session URL
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - `400` `{ message: "A verified email is required for billing", code: "billing_email_required", severity: "error", field: "email" }`

---

### POST /billing/subscription/change
- Auth: Clerk JWT required (`getPolarUserInfo`)
- Rate limit: none
- Service: `BillingService.changeSubscription()` (V1 `billing.subscription.change` → `polar.changeSubscription`)
- Path params / Query: none
- Request body:

```ts
const Body = z.object({
  productKey: z.enum(["starterMonthly", "starterYearly", "plusMonthly", "plusYearly"]),
});
```

- Response 200:

```ts
type Response = { ok: true };
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - `400` `{ message: "A verified email is required for billing", code: "billing_email_required", severity: "error", field: "email" }`
  - `400` `{ message: "Unknown billing product", code: "billing_product_unknown", severity: "error" }`
  - `400` `{ message: "Polar product is not configured", code: "billing_product_not_configured", severity: "error" }`

---

### POST /billing/subscription/cancel
- Auth: Clerk JWT required (`getPolarUserInfo`)
- Rate limit: none
- Service: `BillingService.cancelSubscription()` (V1 `billing.subscription.cancel` → `polar.cancelSubscription`)
- Path params / Query: none
- Request body:

```ts
const Body = z.object({
  revokeImmediately: z.boolean().optional(),   // default false -> cancel at period end
});
```

- Response 200:

```ts
type Response = { ok: true };
```

- Errors:
  - `401` `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - `400` `{ message: "A verified email is required for billing", code: "billing_email_required", severity: "error", field: "email" }`

---

### POST /billing/products/sync  *(deferred — admin/cron path; thin wrapper, can be a BullMQ job)*
- Auth: admin (env allowlist `AQSHA_ADMIN_*` / `admin_entitlements`)
- Rate limit: none
- Service: `BillingService.syncProducts()` (V1 `billing.products.sync` → `polar.syncProducts`)
- Path params / Query: none
- Request body: none (empty)
- Response 200:

```ts
type Response = { ok: boolean };
```

- Errors:
  - `403` `{ message: "Admin access required", code: "forbidden_admin_only", severity: "error" }`

---

### internal: BillingService.consumeCredits()  *(no REST route — shared service-layer write path)*
> Not a public endpoint. Documented because it is THE critical three-caller seam (eve agent runs, feed AI actions, BullMQ workers) and the V1 atomicity invariant must be preserved in V2. V1 source: `billing.entitlements.consumeCredits` / `consumeCreditsInternal`.
- Auth: internal trust boundary (owner resolved by caller; `ownerUserId` == Clerk `tokenIdentifier`)
- Rate limit: none (the global send/token caps live in `SendQuotaService`, Domain 6)
- Transaction invariant (ONE transaction): patch `billing_credit_periods` (`credits_used += credits`, `estimated_cost_cents += estimatedCostCents`) + insert `provider_usage_ledger` + upsert `usage_daily_rollup` (`by_owner_date`, increments `credits`/`estimated_cost_cents`/`event_count`/`feature_counts[feature]`)
- Args:

```ts
const ConsumeCreditsArgs = z.object({
  ownerUserId: z.string(),
  ownerEmail: z.string().nullable().optional(),
  feature: z.enum([
    "normal_chat","pro_chat","cited_answer","deep_research",
    "external_search","sandbox_compute","citation_verify",
  ]),
  provider: z.string(),
  model: z.string().optional(),
  threadId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  totalTokens: z.number().optional(),
  credits: z.number().optional(),            // defaults via estimateCredits(...) when omitted
  estimatedCostCents: z.number().optional(), // defaults via estimateProviderCostCents(...)
  metadataJson: z.string().optional(),
  requiredPlan: z.enum(["free","starter","plus"]).optional(),
  agentKind: z.enum(["lite","pro"]).optional(),
});
```

- Result (return union — NEVER a throw for quota/billing blocks; `EntitlementResult`):

```ts
type EntitlementResult =
  | { ok: true;  planKey: PlanKey; periodKey: string; resetAt: number;
      creditsLimit: number; creditsUsed: number; creditsRemaining: number; }
  | { ok: false; reason: "quota_exceeded" | "subscription_required" | "billing_inactive";
      planKey: PlanKey; requiredPlan: "free" | "starter" | "plus"; resetAt: number;
      creditsLimit: number; creditsUsed: number; creditsRemaining: number; };
```

---

Files inspected (all under `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/`): `billing/current.ts`, `billing/products.ts`, `billing/usage.ts`, `billing/checkout.ts`, `billing/subscription.ts`, `billing/portal.ts`, `billing/entitlements.ts`, `billing/polar.ts`, `billing/catalog.ts`, `billing/validators.ts`, `billing/usageShape.ts`, `billing/admin.ts`, `http.ts`.

## Workspaces

All endpoints in this domain are pure Elysia (Bun) REST over `WorkspaceService` / `FolderService` (the shared service layer also consumed by eve agent tools via `createFromAgentInternal` / `renameFromAgentInternal`). Ownership is keyed on `ownerUserId` (== Clerk `identity.tokenIdentifier`); every authenticated route resolves it via `UserService.ensureCurrentUser` at the boundary. Soft ownership semantics from V1 are preserved: `GET /workspaces/:id` returns `null`/404 instead of throwing when not owned; mutating endpoints throw structured errors.

Cursor pagination uses Convex's `paginationOpts` shape mapped to `{ items, nextCursor }` (a `nextCursor: null` signals the last page; pass it back as `?cursor=`).

---

### GET /workspaces
- Auth: Clerk JWT required
- Rate limit: none
- Service: `WorkspaceService.list()` (`workspaces.list` → index switch `by_owner_status_updated` for active-only vs `by_owner_updated` for `includeArchived`)
- Path params / Query:
```ts
{
  cursor: z.string().nullish(),        // opaque keyset cursor (Convex continueCursor); omit/null for first page
  limit: z.number().int().min(1).max(100).default(25),
  includeArchived: z.boolean().default(false), // false => active-only via by_owner_status_updated
}
```
- Request body: none
- Response 200:
```ts
{
  items: Array<{
    id: string;                 // workspaces._id
    ownerUserId: string;
    name: string;
    emoji: string | null;       // optional in V1; default seeded at create
    description: string | null;
    status: "active" | "archived";
    archivedAt: number | null;  // epoch ms
    createdAt: number;          // epoch ms
    updatedAt: number;          // epoch ms
  }>;
  nextCursor: string | null;    // null when isDone
}
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`

---

### GET /workspaces/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `WorkspaceService.get()` (`workspaces.get` — soft ownership: returns `null` if missing or `ownerUserId !== current`)
- Path params / Query:
```ts
{ id: z.string() }              // workspaces._id
```
- Request body: none
- Response 200:
```ts
{
  id: string;
  ownerUserId: string;
  name: string;
  emoji: string | null;
  description: string | null;
  status: "active" | "archived";
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
} | null                        // null when not found OR not owned (NOT a throw)
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - (No 403/404 — non-ownership returns `null` body with 200, matching V1 `get` semantics.)

---

### POST /workspaces
- Auth: Clerk JWT required
- Rate limit: none (capacity-gated, not rate-gated)
- Service: `WorkspaceService.create()` → `createWorkspaceForOwner` (shared with eve tool `workspaces.createFromAgentInternal`). Runs `assertWorkspaceCapacity` (free=1 / starter=5 / plus=20 / admin=unlimited via `PLAN_CATALOG[planKey].workspaceLimit`), normalizes name (`normalizeName`), seeds deterministic `emoji` (`workspaceEmojiForNewWorkspace`).
- Path params / Query: none
- Request body:
```ts
z.object({
  name: z.string(),            // normalized: collapse whitespace + trim; see name errors below
})
```
- Response 200:
```ts
{
  id: string;                  // workspaces._id of the new row
}
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 400 `{ message: "Workspace name is required", code: "name_required", severity: "warning", field: "name" }`
  - 400 `{ message: "Workspace name is too long", code: "name_too_long", severity: "warning", field: "name" }` (>120 chars after normalize)
  - 403 `{ message: "Workspace limit reached for current plan", code: "workspace_limit_reached", severity: "warning" }`

> Note: V1 `normalizeName` throws bare-string `ConvexError("Workspace name is required" / "... is too long")`; V2 standardizes these onto structured `appError` codes `name_required` / `name_too_long` per the access.ts hardening callout.

---

### PATCH /workspaces/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `WorkspaceService.rename()` (`workspaces.rename` → `renameWorkspaceForOwner`, shared with eve tool `workspaces.renameFromAgentInternal`) and/or `WorkspaceService.updateEmoji()` (`workspaces.updateEmoji` → `normalizeWorkspaceEmoji` single-grapheme guard). V2 folds V1's two separate mutations into one PATCH; at least one of `name`/`emoji` must be present. Both internally `assertWorkspaceOwner`.
- Path params / Query:
```ts
{ id: z.string() }             // workspaces._id
```
- Request body:
```ts
z.object({
  name: z.string().optional(),   // normalizeName: collapse whitespace + trim, 1..120
  emoji: z.string().optional(),  // normalizeWorkspaceEmoji: exactly 1 grapheme, emoji-like, no whitespace/control, <=32 bytes
}).refine((v) => v.name !== undefined || v.emoji !== undefined)
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }` (not owned / missing — V1 `assertWorkspaceOwner` throws `ConvexError("Workspace not found")`, mapped to structured)
  - 400 `{ message: "Workspace name is required", code: "name_required", severity: "warning", field: "name" }`
  - 400 `{ message: "Workspace name is too long", code: "name_too_long", severity: "warning", field: "name" }`
  - 400 `{ message: "Emoji workspace tidak valid.", code: "workspace_emoji_invalid", severity: "warning", field: "emoji" }` (V1 `throwInvalidWorkspaceEmoji`, verbatim message/code/field)

---

### POST /workspaces/:id/archive
- Auth: Clerk JWT required
- Rate limit: none
- Service: `WorkspaceService.archive()` (`workspaces.archive`). Idempotent: already-`archived` returns `{ ok: true }` without rewrite. Sets `status="archived"`, `archivedAt=now`, `updatedAt=now`. No hard delete and NO unarchive in V1.
- Path params / Query:
```ts
{ id: z.string() }             // workspaces._id
```
- Request body: none
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }`

---

### GET /workspaces/:id/folders
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FolderService.list()` (`workspaces.folders.list` → index `by_owner_workspace_status_updated`, active folders only, `.take(200)` cap; asserts workspace ownership first). Non-paginated.
- Path params / Query:
```ts
{ id: z.string() }             // workspaceId (workspaces._id)
```
- Request body: none
- Response 200:
```ts
{
  items: Array<{
    id: string;                // workspaceFolders._id
    ownerUserId: string;
    workspaceId: string;
    name: string;
    status: "active";          // list returns active-only
    createdAt: number;
    updatedAt: number;
    deletedAt: number | null;
  }>;                          // capped at 200, newest-updated first
}
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }`

---

### POST /workspaces/:id/folders
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FolderService.create()` (`workspaces.folders.create`). Requires the workspace be `active` (`assertWorkspaceOwner(..., { requireActive: true })`), normalizes name, enforces unique active name per (owner, workspace) via `by_owner_workspace_name`.
- Path params / Query:
```ts
{ id: z.string() }             // workspaceId (workspaces._id)
```
- Request body:
```ts
z.object({
  name: z.string(),            // normalizeName: collapse whitespace + trim, 1..120
})
```
- Response 200:
```ts
{ id: string }                 // workspaceFolders._id of the new row
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }`
  - 409 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }` (V1 `assertWorkspaceOwner requireActive` throws `ConvexError("Workspace is archived")`)
  - 400 `{ message: "Folder name is required", code: "name_required", severity: "warning", field: "name" }`
  - 400 `{ message: "Folder name is too long", code: "name_too_long", severity: "warning", field: "name" }`
  - 409 `{ message: "Folder name already exists", code: "folder_name_exists", severity: "warning", field: "name" }` (active duplicate; V1 `ConvexError("Folder name already exists")`)

---

### PATCH /folders/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FolderService.rename()` (`workspaces.folders.rename`). Asserts folder ownership (`assertFolderOwner`, must be `active`) + parent workspace active. NOTE: V1 does NOT re-check name uniqueness on rename — preserve that (no `folder_name_exists` here).
- Path params / Query:
```ts
{ id: z.string() }             // workspaceFolders._id
```
- Request body:
```ts
z.object({
  name: z.string(),            // normalizeName: collapse whitespace + trim, 1..120
})
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found", severity: "error" }` (missing / not owned / not active; V1 `assertFolderOwner` throws `ConvexError("Folder not found")`)
  - 409 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 400 `{ message: "Folder name is required", code: "name_required", severity: "warning", field: "name" }`
  - 400 `{ message: "Folder name is too long", code: "name_too_long", severity: "warning", field: "name" }`

---

### POST /folders/:id/move
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FolderService.move()` (`workspaces.folders.move` → cascades via `syncArtifactWorkspaceMove`). Asserts folder ownership + source workspace active + target workspace active. No-op `{ ok: true }` if `folder.workspaceId === targetWorkspaceId`. Re-checks unique active name in the TARGET workspace. Moves the folder, then re-points every active artifact in it (`by_owner_workspace_folder_status_updated`) to the target workspace and cascades `workspaceId` onto `artifactContents` / `artifactUrls` / `artifactPaperMetadata` / `artifactExtractions`. V1 uses bare `.collect()` (unbounded) over the folder's artifacts — V2 paginates/caps this fan-out (BullMQ worker if large).
- Path params / Query:
```ts
{ id: z.string() }             // folderId (workspaceFolders._id)
```
- Request body:
```ts
z.object({
  targetWorkspaceId: z.string(),  // workspaces._id of destination
})
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found", severity: "error" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }` (target missing / not owned)
  - 409 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }` (source or target archived)
  - 409 `{ message: "Folder name already exists in target workspace", code: "folder_name_exists", severity: "warning", field: "name" }` (V1 `ConvexError("Folder name already exists in target workspace")`)

---

### DELETE /folders/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FolderService.remove()` (`workspaces.folders.remove`). Soft-delete only: orphans (un-files) the folder's active artifacts by clearing `folderId` (does NOT delete artifacts), then sets folder `status="deleted"`, `deletedAt=now`, `updatedAt=now`. Asserts folder ownership + parent workspace active. V1 uses bare `.collect()` over the folder's artifacts — V2 paginates/caps the orphan fan-out.
- Path params / Query:
```ts
{ id: z.string() }             // workspaceFolders._id
```
- Request body: none
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found", severity: "error" }`
  - 409 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`

---

**Domain notes (grounding):**
- No `GET /workspaces/:id/members`, `POST /workspaces/:id/default`, `DELETE /workspaces/:id`, or unarchive endpoint exist — V1 only flips `active <-> archived` (`workspaces.archive`); these draft endpoints are dropped.
- `ensureDefaultWorkspaceForOwner` (`workspaces/defaults.ts`, default name `"Workspace Saya"`, emoji seeded) is NOT a public endpoint here — it is a cold-start seam called inside `auth.syncCurrentUser` (Domain 1 `POST /users/me/sync`) and the artifact link/save cold-start path (Domain 5).
- V1's bare-string `ConvexError` asserts (`assertWorkspaceOwner` → `"Workspace not found"` / `"Workspace is archived"`, `assertFolderOwner` → `"Folder not found"`, `normalizeName` → `"... is required"` / `"... is too long"`, folder-name duplicates) are standardized onto structured `appError` codes in V2 per the access.ts hardening callout; the human-facing `message` strings are kept stable (and `workspace_emoji_invalid` keeps its exact Indonesian message `"Emoji workspace tidak valid."`).

## Artifacts

Domain 5 — Tier 2 Core Product. Runtime: hybrid (Elysia persists + eve drives writes). All endpoints require a Clerk JWT and resolve `ownerUserId` (== Clerk `identity.tokenIdentifier`) via `UserService.ensureCurrentUser`. Artifacts is a 5-table split: `artifacts` (parent) + `artifact_contents` (1:1) + `artifact_extractions` (1:N) + `artifact_paper_metadata` (1:1) + `artifact_urls` (1:1). All `_storage` handles become R2 object keys; `generateUploadUrl` becomes an R2 presigned PUT, `getRenderPayload` resolves a fresh R2 presigned GET. Inline limits preserved: `ARTIFACT_BODY_INLINE_LIMIT = 700_000` chars (text offloaded to R2 above), upload-text offload at `900_000` chars, `MAX_UPLOAD_BYTES = 52_428_800` (50 MB). Library capacity is charged at file-time via `ArtifactService.assertLibraryCapacity` against `PLAN_CATALOG[planKey].libraryItemLimit` (free / starter / plus / admin = unlimited).

Shared service seams reused by HTTP + eve tools + BullMQ workers:
- `ArtifactService.saveUrl(createUrl)` — Save-to-Workspace + URL ingest trigger
- `ArtifactService.linkToWorkspace(linkArtifactToWorkspace == saveAttachmentToWorkspace; promoteAttachmentToWorkspaceInternal)`
- `ArtifactService.finalizeUpload(finalizeUploadedDocument; shared by createFromStorage / createThreadAttachmentFromStorage / finalizeStoredArtifact)`
- `ArtifactService.applyAction(executeArtifact/proposeArtifact via createArtifactFromAgentInternal / updateArtifactFromAgentInternal / deleteArtifactFromAgentInternal)` — eve-owned (Domain 7) but persists via this service.

Common artifact projection (`toArtifactListItem` / `normalizeArtifactReadModel`) used by list/get responses:

```ts
const ArtifactListItem = z.object({
  _id: z.string(),                         // artifacts.id (was Id<"artifacts">)
  workspaceId: z.string().nullable(),      // null for headless (chat-attached / agent) rows
  folderId: z.string().nullable(),
  artifactType: z.enum(["markdown","plain_text","pdf","docx","html","svg","mermaid","json","csv","code","url"]),
  artifactFamily: z.enum(["text","file","interactive","visual","data","link"]),
  source: z.enum(["manual","upload","agent","url"]),
  title: z.string(),
  language: z.string().nullable(),
  mimeType: z.string().nullable(),
  fileName: z.string().nullable(),
  byteSize: z.number().nullable(),
  indexingStatus: z.enum(["not_indexed","pending","ready","failed"]),
  indexingFailureReason: z.string().nullable(),
  detectedDocumentKind: z.enum(["generic","scholarly_paper"]).nullable(),
  plainTextPreview: z.string().nullable(),
  status: z.enum(["active","deleted"]).nullable(),
  createdAt: z.number(),                   // epoch ms
  updatedAt: z.number(),                   // epoch ms
});
```

---

### GET /workspaces/:id/artifacts
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.listByWorkspace()` (V1 `artifacts.listByWorkspace`)
- Path params / Query:
```ts
// path
{ id: z.string() }  // workspaceId
// query
{
  folderId: z.string().optional(),
  cursor: z.string().nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}
```
- Request body: none
- Response 200:
```ts
{
  items: ArtifactListItem[],   // status="active" only, ordered by updatedAt desc
  nextCursor: string | null,
}
```
- Errors:
  - 404 `{ message: "Workspace not found", code: "workspace_not_found", severity: "error" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found", severity: "error" }` (when `folderId` not owned/active)
  - 401 `{ message: "Authentication required", code: "unauthenticated", severity: "error" }`

---

### GET /workspaces/:id/artifacts/context-picker
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.listForContextPicker()` (V1 `artifacts.listForContextPicker`) — top 50 active, non-paginated
- Path params / Query:
```ts
{ id: z.string() }  // workspaceId
```
- Request body: none
- Response 200:
```ts
{ items: ArtifactListItem[] }   // <= 50, updatedAt desc
```
- Errors:
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`

---

### GET /artifacts/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.get()` (V1 `artifacts.get`) — workspace-scoped only (returns `null` for headless rows where `workspaceId` is null), inline text only
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body: none
- Response 200 (soft ownership — returns `null` not 404 when missing/not-owned/headless):
```ts
{
  artifact: ArtifactListItem & {
    // normalizeArtifactReadModel spreads the full row; key extra read fields:
    ragEntryId: string | null,
    storageKey: string | null,        // was storageId (R2 key)
    detectedDocumentKind: "generic" | "scholarly_paper" | null,
  },
  content: {                          // artifact_contents row (1:1) or null
    _id: string,
    artifactId: string,
    blocksJson: string | null,        // BlockNote blocks (jsonb)
    markdown: string | null,
    plainText: string | null,
    contextText: string | null,
    ingestionStatus: "pending" | "ready" | "failed" | null,
    ingestionFailureReason: string | null,
    ragEntryId: string | null,
    updatedAt: number,
  } | null,
  url: {                              // artifact_urls row (only for artifactType="url") or null
    _id: string,
    originalUrl: string,
    normalizedUrl: string,
    status: "pending" | "ready" | "failed",
    title: string | null,
    description: string | null,
    siteName: string | null,
    readableText: string | null,
    failureReason: string | null,
    extractedAt: number | null,
  } | null,
} | null
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated" }`

---

### GET /artifacts/:id/render-payload
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.getRenderPayload()` (V1 `artifacts.getRenderPayload` → `getContentTarget`) — headless-tolerant (ownership + active-status are the only boundary; chat attachments with `workspaceId=null` resolve). For `pdf`/`docx`, resolves a fresh R2 presigned GET `url`.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body: none
- Response 200 (discriminated union on `artifactType`; `null` when artifact missing/not-owned/not-active or blob unresolved):
```ts
type ArtifactRenderPayload =
  | { artifactType: "markdown"; blocksJson: string; markdown: string; plainText: string }
  | {
      artifactType: "pdf" | "docx";
      fileName: string;
      mimeType: string;
      byteSize: number;
      url: string;                    // R2 presigned GET (was ctx.storage.getUrl)
      indexingStatus: "not_indexed" | "pending" | "ready" | "failed";
      indexingFailureReason?: string;
    }
  | {
      artifactType: "url";
      originalUrl: string;
      normalizedUrl: string;
      status: "pending" | "ready" | "failed";
      title?: string;
      description?: string;
      siteName?: string;
      failureReason?: string;
      readableText: string;
    }
  | {
      artifactType: "plain_text" | "html" | "svg" | "mermaid" | "json" | "csv" | "code";
      source: string;
      language?: string;
    };
// 200 body: ArtifactRenderPayload | null
```
- Errors:
  - 401 `{ message: "Authentication required", code: "unauthenticated" }`

---

### POST /artifacts/upload-url
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.generateUploadUrl()` (V1 `artifacts.generateUploadUrl`) — R2 presigned PUT (presign step only; NO type/size check here). Scope is workspace OR thread (exactly one). For workspace scope asserts owner + active; for thread scope asserts thread owner.
- Path params / Query: none
- Request body:
```ts
z.object({
  workspaceId: z.string().optional(),
  threadId: z.string().optional(),
}).refine(b => Boolean(b.workspaceId) !== Boolean(b.threadId),
  { message: "Provide exactly one of workspaceId or threadId" })
```
- Response 200 (R2 presigned PUT contract — replaces the bare string V1 returned):
```ts
{
  uploadUrl: string,   // R2 presigned PUT URL
  key: string,         // R2 object key to pass back to the finalize endpoint
}
```
- Errors:
  - 400 `{ message: "Provide exactly one of workspaceId or threadId", code: "upload_scope_invalid", field: "workspaceId" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`
  - 404 `{ message: "Thread not found", code: "thread_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`

---

### POST /workspaces/:id/artifacts/upload
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.finalizeUpload()` (V1 `artifacts.uploads.createFromStorage` → `createUploadedArtifactInternal` + `finalizeUploadedDocument`). Inserts parent + empty `artifact_contents`, extracts text inline (`unpdf`/`mammoth`/utf8) → RAG index, then queues the resolver+LLM metadata-enrichment worker (`paper-enrichment`, **no GROBID**). `validateUpload`: name required, size > 0, size <= 50 MB, allow-list (`uploadArtifactType`: pdf / docx / markdown / plain_text / csv / json). Charges library capacity.
- Path params / Query:
```ts
{ id: z.string() }  // workspaceId
```
- Request body (R2 finalize — `key` is the R2 object key from upload-url):
```ts
z.object({
  key: z.string(),                  // R2 object key (was storageId)
  folderId: z.string().optional(),
  fileName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
})
```
- Response 200:
```ts
{
  artifactId: string,
  title: string,           // derived from fileName (titleFromFileName, 120-char cap)
  indexed: boolean,        // true when RAG entry created (ragEntryId present)
}
```
- Errors:
  - 400 `{ message: "File name is required", code: "upload_filename_required", field: "fileName" }`
  - 400 `{ message: "File is empty", code: "upload_empty", field: "size" }`
  - 400 `{ message: "File is too large. Maximum upload size is 50 MB.", code: "upload_too_large", field: "size", severity: "warning" }`
  - 400 `{ message: "Tipe file tidak didukung. Unggah PDF, DOCX, TXT, Markdown, CSV, atau JSON.", code: "upload_unsupported_type", field: "mimeType", severity: "warning" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found" }`
  - 409 `{ message: "Library item limit reached for current plan", code: "library_item_limit_reached", severity: "warning" }`

---

### POST /threads/:id/attachments/upload
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.finalizeUpload()` (V1 `artifacts.uploads.createThreadAttachmentFromStorage` → `createThreadAttachmentInternal` + `finalizeUploadedDocument`). Born HEADLESS: `threadId` set, `workspaceId=null`, `source="upload"`. Same `validateUpload` allow-list/size as workspace upload. NOT capacity-charged here (charged later at link-workspace).
- Path params / Query:
```ts
{ id: z.string() }  // threadId
```
- Request body:
```ts
z.object({
  key: z.string(),                  // R2 object key
  fileName: z.string().min(1),
  mimeType: z.string(),
  size: z.number().int().positive(),
})
```
- Response 200:
```ts
{ artifactId: string, title: string, indexed: boolean }
```
- Errors:
  - 404 `{ message: "Thread not found", code: "thread_not_found" }`
  - 400 `{ message: "File is too large. Maximum upload size is 50 MB.", code: "upload_too_large", field: "size", severity: "warning" }`
  - 400 `{ message: "Tipe file tidak didukung. Unggah PDF, DOCX, TXT, Markdown, CSV, atau JSON.", code: "upload_unsupported_type", field: "mimeType", severity: "warning" }`
  - 400 `{ message: "File name is required", code: "upload_filename_required", field: "fileName" }`
  - 400 `{ message: "File is empty", code: "upload_empty", field: "size" }`

---

### POST /workspaces/:id/documents
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.createDocument()` (V1 `artifacts.createDocument`) — blank editable Markdown artifact (`artifactType="markdown"`, `source="manual"`, `indexingStatus="ready"`) + empty `artifact_contents` row. Charges library capacity.
- Path params / Query:
```ts
{ id: z.string() }  // workspaceId
```
- Request body:
```ts
z.object({
  folderId: z.string().optional(),
  title: z.string().optional(),     // normalizeName: trimmed, <=120 chars; default "Untitled markdown"
})
```
- Response 200:
```ts
{ artifactId: string }   // V1 returns v.id("artifacts")
```
- Errors:
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found" }`
  - 400 `{ message: "Artifact title is too long", code: "artifact_title_too_long", field: "title" }`
  - 409 `{ message: "Library item limit reached for current plan", code: "library_item_limit_reached", severity: "warning" }`

---

### PUT /artifacts/:id/document
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.updateDocument()` (V1 `artifacts.updateDocument` → `updateMarkdownInternal`). Single-revision overwrite (no version history). Text fields above `ARTIFACT_BODY_INLINE_LIMIT` (700_000 chars) are offloaded to R2 and the row stores `*StorageKey` instead of inline. Requires `artifactType="markdown"` and a non-archived owning workspace.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body (matches V1 `updateDocument` args; `plainText` required):
```ts
z.object({
  title: z.string().optional(),
  blocksJson: z.string().optional(),   // BlockNote blocks
  markdown: z.string().optional(),
  plainText: z.string(),
})
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 404 `{ message: "Artifact not found", code: "artifact_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 400 `{ message: "Artifact is not editable Markdown", code: "artifact_not_editable_markdown" }`
  - 400 `{ message: "Artifact title is too long", code: "artifact_title_too_long", field: "title" }`
  - 404 `{ message: "Artifact content not found", code: "artifact_content_not_found" }`

---

### POST /workspaces/:id/artifacts/url
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.saveUrl()` (V1 `artifacts.createUrl`). CORE Save-to-Workspace path (feed / explore / reader). Dedupe by `normalizedUrl` within `(ownerUserId, workspaceId)` via `artifact_urls.by_owner_workspace_normalized_url` — returns the existing active artifact id idempotently. Creates `artifactType="url"`, `source="url"`, `indexingStatus="pending"` + `artifact_urls` row (`status="pending"`), then queues `ingestUrl` (BullMQ). Charges library capacity (only on a genuinely new row).
- Path params / Query:
```ts
{ id: z.string() }  // workspaceId
```
- Request body:
```ts
z.object({
  url: z.string().url(),               // normalizeUrl: must be http/https; hash stripped, host lowercased
  folderId: z.string().optional(),
  title: z.string().optional(),        // default titleFromUrl(normalizedUrl)
})
```
- Response 200:
```ts
{ artifactId: string }   // V1 returns v.id("artifacts"); existing or newly created
```
- Errors:
  - 400 `{ message: "URL is invalid", code: "url_invalid", field: "url" }`
  - 400 `{ message: "URL must use http or https", code: "url_protocol_invalid", field: "url" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 404 `{ message: "Folder not found", code: "folder_not_found" }`
  - 409 `{ message: "Library item limit reached for current plan", code: "library_item_limit_reached", severity: "warning" }`

---

### POST /artifacts/:id/link-workspace
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.linkToWorkspace()` (V1 `artifacts.linkArtifactToWorkspace` == `saveAttachmentToWorkspace`; via `linkHeadlessArtifactToWorkspace` + `promoteAttachmentToWorkspaceInternal`). Files a HEADLESS artifact (chat attachment `source="upload"` OR agent output `source="agent"`, `workspaceId=null`, `threadId` set) into a workspace. Resolution order: if already filed → return existing; else thread-bound workspace (from `chat_threads.workspaceId`); else explicit `workspaceId`; else cold-start: 0 active workspaces → auto-create one (named from artifact title, capacity-checked); exactly 1 active → use it; >=2 active → require picker. Charges library capacity at file-time, then re-indexes RAG.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body (matches `linkArtifactToWorkspaceArgs`):
```ts
z.object({
  workspaceId: z.string().optional(),   // required only when >=2 active workspaces and no thread binding
})
```
- Response 200 (matches `linkArtifactToWorkspaceReturns`):
```ts
{
  workspaceId: string,
  artifactId: string,
  workspaceName: string,
}
```
- Errors:
  - 404 `{ message: "Attachment not found", code: "attachment_not_found" }`
  - 400 `{ message: "Choose a workspace to save this attachment", code: "attachment_workspace_required", field: "workspaceId" }`
  - 400 `{ message: "Attachment must be saved to the bound workspace", code: "attachment_workspace_mismatch", field: "workspaceId" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }`
  - 409 `{ message: "Workspace limit reached for current plan", code: "workspace_limit_reached", severity: "warning" }` (cold-start auto-create)
  - 409 `{ message: "Library item limit reached for current plan", code: "library_item_limit_reached", severity: "warning" }`

---

### PATCH /artifacts/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.rename()` + `ArtifactService.move()` (V1 `artifacts.rename` + `artifacts.move`). Single endpoint supporting rename and/or move (workspace + folder). Move cascades `workspaceId` onto side tables via `syncArtifactWorkspaceMove`. Both operands require a workspace-scoped, active, owned artifact (`assertWorkspaceArtifactOwner`) and a non-archived target workspace.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body (any subset; at least one field):
```ts
z.object({
  title: z.string().optional(),               // rename — normalizeName, <=120 chars
  targetWorkspaceId: z.string().optional(),    // move — defaults to current workspace if omitted
  folderId: z.string().nullable().optional(),  // move into folder (or null to unfile within workspace)
}).refine(b => b.title !== undefined || b.targetWorkspaceId !== undefined || b.folderId !== undefined,
  { message: "Provide at least one field to update" })
```
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 404 `{ message: "Artifact not found", code: "artifact_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 404 `{ message: "Workspace not found", code: "workspace_not_found" }` (target not owned)
  - 404 `{ message: "Folder not found", code: "folder_not_found" }`
  - 400 `{ message: "Artifact title is required", code: "artifact_title_required", field: "title" }`
  - 400 `{ message: "Artifact title is too long", code: "artifact_title_too_long", field: "title" }`

---

### DELETE /artifacts/:id
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.remove()` (V1 `artifacts.remove`). Soft-delete: sets `status="deleted"`, `deletedAt=now`. V2 MUST ADDITIONALLY enqueue an R2-blob cleanup + RAG-entry deletion BullMQ job (V1 leak — V1 frees neither the R2/storage blob nor the `ragEntryId`). Requires workspace-scoped active owned artifact.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body: none
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 404 `{ message: "Artifact not found", code: "artifact_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`

---

### POST /artifacts/:id/retry-url-extraction  (deferred)
- Auth: Clerk JWT required
- Rate limit: none
- Service: `ArtifactService.retryUrlExtraction()` (V1 `artifacts.retryUrlExtraction`). Re-queues `ingestUrl` for a failed/stale `url` artifact: resets `artifacts.indexingStatus="pending"` + clears `indexingFailureReason`, resets `artifact_urls.status="pending"` + clears `failureReason`. Requires `artifactType="url"` on a workspace-scoped active owned artifact in a non-archived workspace.
- Path params / Query:
```ts
{ id: z.string() }  // artifactId
```
- Request body: none
- Response 200:
```ts
{ ok: true }
```
- Errors:
  - 404 `{ message: "Artifact not found", code: "artifact_not_found" }`
  - 400 `{ message: "Workspace is archived", code: "workspace_archived", severity: "warning" }`
  - 400 `{ message: "Artifact is not a URL", code: "artifact_not_url" }`
  - 404 `{ message: "URL artifact not found", code: "artifact_url_not_found" }`

---

### Agent write seam (eve **MCP connection** tools — Domain 7, listed here for the shared service contract)

The agent artifact write tools are **NOT** in-process `defineTool`s and **NOT** REST: they are served by the **Aqsha MCP server** (`POST /mcp`, Domain 7) over the same `ArtifactService` persistence used above, and reached by the eve agent through the `aqsha_write` connection (`agent/connections/aqsha_write.ts`). The model discovers them via `connection__search` and calls the **qualified names** `connection__aqsha_write__propose_artifact` / `connection__aqsha_write__execute_artifact` / `connection__aqsha_write__delete_artifact`. The model never sees the MCP URL or token. Documented here as the shared service contract:

#### eve MCP: `connection__aqsha_write__propose_artifact` / `__execute_artifact`
- Auth: the `aqsha_write` connection sends the user's Clerk bearer (`auth.getToken`, `principalType:'user'`); the MCP server runs `clerk.verifyToken()` → `ownerUserId`.
- Rate limit: none (covered by `SendQuotaService` at the send entrypoint, Domain 6) — credits consumed by the run, not per tool
- Service: `ArtifactService.applyAction()` → `createArtifactFromAgentInternal` (born HEADLESS: `workspaceId=null`, `source="agent"`, `indexingStatus="ready"`) / `updateArtifactFromAgentInternal`. **Human gate = the `aqsha_write` connection approval** (`always()`/`once()`, a real eve gate that pauses/resumes the durable session — NOT a hook). The business invariant "`execute_artifact` requires an approved `propose_artifact`" lives in the MCP server `execute()` (our code).
- Input (matches `createArtifactFromAgentInternal` / `updateArtifactFromAgentInternal` args; agent-writable types only):
```ts
{
  artifactId?: string,                  // present → update; absent → create
  title: string,
  artifactType: "markdown"|"plain_text"|"html"|"svg"|"mermaid"|"json"|"csv"|"code",
  content: string,
  plainText: string,
  language?: string,
  workspaceId?: string,                 // optional; when supplied, validated + counts library capacity
  folderId?: string,                    // only meaningful with workspaceId
}
```
- Output:
```ts
// create: artifactId (string)
// update/delete: { ok: true }
```
- Errors (structured `AppError`):
  - `{ message: "Unsupported generated artifact type", code: "artifact_type_unsupported" }`
  - `{ message: "Uploaded file artifacts cannot be overwritten by generated text", code: "artifact_not_overwritable" }`
  - `{ message: "Generated artifact is too large to save inline", code: "artifact_too_large_inline", severity: "warning" }` (content or plainText > 700_000 chars)
  - `{ message: "Artifact not found", code: "artifact_not_found" }`
  - `{ message: "Library item limit reached for current plan", code: "library_item_limit_reached", severity: "warning" }` (only when `workspaceId` supplied)

#### eve MCP: `connection__aqsha_write__delete_artifact`
- Auth: `aqsha_write` connection (user Clerk bearer) → MCP server `clerk.verifyToken()` → `ownerUserId`
- Rate limit: none
- Service: `ArtifactService.applyAction()` → `deleteArtifactFromAgentInternal` (headless-tolerant `assertAgentArtifactOwner`). Soft-delete (`status="deleted"`); V2 must enqueue the same R2/RAG cleanup as `DELETE /artifacts/:id`.
- Input: `{ artifactId: string }`
- Output: `{ ok: true }`
- Errors: `{ message: "Artifact not found", code: "artifact_not_found" }`

---

Source files: `packages/convex/convex/artifacts.ts` (facade: list/get/createDocument/generateUploadUrl/updateDocument/getRenderPayload/createUrl/retryUrlExtraction/rename/move/remove + internal mutations + link/save), `packages/convex/convex/artifacts/uploads.ts` (`createFromStorage`/`createThreadAttachmentFromStorage`/`finalizeStoredArtifact`/`finalizeUploadedDocument`/`validateUpload`), `packages/convex/convex/artifacts/model.ts` (`ARTIFACT_BODY_INLINE_LIMIT=700_000`, `normalizeUrl`, `titleFromUrl`, `artifactTypeForLegacyArtifact`, `uploadArtifactType`), `packages/convex/convex/artifacts/uploadLimits.ts` (`MAX_UPLOAD_BYTES`/`MAX_UPLOAD_MB`), `packages/convex/convex/artifacts/uploadPolicy.ts` (allow-list + `UPLOAD_REJECTED_MESSAGE`), `packages/convex/convex/workspaces/access.ts` (`assertWorkspaceArtifactOwner`/`assertThreadAttachmentOwner`/`assertAgentArtifactOwner`/`assertUploadedArtifactOwner`/`normalizeName`).

Note on error codes: V1 emits most artifact-not-found/workspace/folder failures as bare-string `ConvexError` ("Artifact not found", "Workspace not found", "Folder not found", "Workspace is archived") via `workspaces/access.ts`, NOT structured `appError`. Per the project Error-Handling rule for new/touched code, I assigned structured `code` slugs above (`artifact_not_found`, `workspace_not_found`, `folder_not_found`, `workspace_archived`, etc.) so V2 standardizes these onto `appError`; the `message` strings are preserved verbatim. Codes already structured in V1 (`library_item_limit_reached`, `workspace_limit_reached`, `artifact_not_url`, `artifact_not_editable_markdown`, `artifact_content_not_found`, `artifact_url_not_found`, `artifact_not_overwritable`, `artifact_too_large_inline`, `attachment_not_found`, `attachment_workspace_required`, `attachment_workspace_mismatch`) are taken directly from the source.

## Threads & Chat (api-v2 persistence surface)

> **Tier 3 — Agent Runtime · runtime: hybrid (Elysia persists + eve drives).**
>
> This domain owns the **product persistence/projection + entry-gate** layer only. The run loop, streaming, subagents, HITL gating, and deep-research orchestration live in **eve** (Domain 7). The send entrypoints (`POST /threads`, `POST /threads/:id/messages`) run `SendQuotaService.check` (the shared billing + rate gate) and then hand the turn to eve instead of `ctx.scheduler.runAfter(0, internal.agent.dispatchRun, …)`. The V1 `dispatchRun` / `forwardCancel` / `forwardResume` HTTP bridge, the `watchdogSweep` cron, and the `requireServiceToken agent/service.*` surface all disappear.
>
> **Shared field semantics**
> - `threadId` / `runId` are **service-minted strings** (`thr_<uuid>` / `run_<uuid>`), used directly as PG text PKs/FKs — not opaque DB ids.
> - `messageId` is the `chat_messages` row id (V1 returned `String(message._id)`).
> - All timestamps (`createdAt`, `updatedAt`, `lastActivityAt`, `respondedAt`) are **epoch-ms `number`** (stored `bigint`), preserving the V1 contract.
> - Ownership is soft on reads: a thread the caller does not own resolves to `null` (single) or `[]` (list), **never** a throw. Mutations throw `thread_not_found`.
> - `agentKind` is fixed at thread creation (`POST /threads`); follow-ups inherit it.
> - List reads add **real keyset pagination** in V2 (`{ items, nextCursor }`). V1 hard caps (50 threads / 100 messages) become page sizes.

---

### GET /threads
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listThreads()` (was `agent.queries.listThreads`)
- **Path params / Query:**
```ts
const Query = z.object({
  cursor: z.string().nullish(),       // keyset cursor (encodes lastActivityAt+threadId)
  limit: z.number().int().min(1).max(50).default(50),
});
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    threadId: string;
    workspaceId?: string;
    title: string;                    // V1 default "Percakapan baru" when unset
    createdAt: number;                // ms (was thread._creationTime)
    lastActivityAt: number;           // ms
    lastMessagePreview: string;       // "" when unset
    messageCount: number;
    status: "idle" | "streaming" | "failed";
    lastAgentKind: "lite" | "pro";
  }>;
  nextCursor: string | null;
};
```
- **Errors:** `401 { message, code: "unauthenticated", severity: "error" }`

---

### GET /workspaces/:id/threads
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listThreadsByWorkspace()` (was `agent.queries.listThreadsByWorkspace`; V2 adds a `(ownerUserId, workspaceId, lastActivityAt)` index — V1 did an owner scan + in-memory filter)
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // workspaceId
const Query  = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(50),
});
```
- **Request body:** none
- **Response 200:** identical item shape to `GET /threads`:
```ts
type Response = {
  items: Array<{
    threadId: string;
    workspaceId?: string;
    title: string;
    createdAt: number;
    lastActivityAt: number;
    lastMessagePreview: string;
    messageCount: number;
    status: "idle" | "streaming" | "failed";
    lastAgentKind: "lite" | "pro";
  }>;
  nextCursor: string | null;
};
```
- **Errors:** `401 { message, code: "unauthenticated" }`. Non-owned/unknown workspace returns `{ items: [], nextCursor: null }` (soft).

---

### GET /threads/:id
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.getThread()` (was `agent.queries.getThread`)
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId (thr_*)
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  threadId: string;
  title: string;                      // default "Percakapan baru"
  status: "idle" | "streaming" | "failed";
  workspaceId?: string;
  lastAgentKind: "lite" | "pro";      // from thread.agentKind
} | null;                             // null when not owned / not found (soft)
```
- **Errors:** `401 { message, code: "unauthenticated" }`

---

### GET /threads/:id/messages
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listMessages()` (was `agent.queries.listMessages`; V2 replaces the V1 "newest 100 then `.reverse()`" hard cap with cursor pagination over `chat_messages by_thread_created`)
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
const Query  = z.object({
  cursor: z.string().nullish(),       // keyset on (createdAt, messageId)
  limit: z.number().int().min(1).max(100).default(100),
});
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    messageId: string;
    role: "user" | "assistant" | "system";
    text: string;
    reasoning?: string;               // captured extended-thinking stream
    runId?: string;
    status: "streaming" | "complete" | "error";
    createdAt: number;                // ms
  }>;
  nextCursor: string | null;          // chronological asc page; cursor advances backward in time
};
```
- **Errors:** `401 { message, code: "unauthenticated" }`. Non-owned thread returns `{ items: [], nextCursor: null }` (soft).

---

### POST /threads
- **Auth:** Clerk JWT required
- **Rate limit:** `SendQuotaService.check` → `sendMessage` 1 / 5s (capacity 2, per `ownerUserId`) + `globalSendMessage` 1000/min + `globalTokenUsage` 100000/min (count = `ceil(content.length / 4)`), then `BillingService.consumeCredits` (feature `deep_research` | `pro_chat` | `normal_chat`).
- **Service:** `ThreadService.startThread()` → `SendQuotaService.checkAndConsumeSendQuota()` + `persistTurnAndDispatch()` (creates thread + first user `chat_messages` row + `agent_runs` row `status: "queued"`, then opens the eve session instead of `dispatchRun`). Slash-command split via `resolveCommandDispatch` (display vs dispatch prompt; `/deep` → `isDeep`).
- **Path params / Query:** none
- **Request body:**
```ts
const Body = z.object({
  content: z.string().min(1).max(32_000),       // MAX_PROMPT_LENGTH; trimmed
  agentKind: z.enum(["lite", "pro"]),
  commandId: z.string().optional(),             // prompt-command id (e.g. "deep-research")
  workspaceId: z.string().optional(),           // must be owned, else workspace_not_found
  contextArtifactIds: z.array(z.string()).optional().default([]),
  contextWorkspaceIds: z.array(z.string()).optional().default([]),
});
```
- **Response 200:**
```ts
type Response =
  | { ok: true; threadId: string; messageId: string; runId: string }
  | {
      ok: false;
      reason:
        | "rate_limited"
        | "quota_exceeded"
        | "subscription_required"
        | "billing_inactive"
        | "reply_in_progress";
      retryAt?: number;                          // ms; set for rate_limited
      resetAt?: number;                          // ms; set for entitlement blocks
      requiredPlan?: "free" | "starter" | "plus";
      creditsRemaining?: number;
    };
```
  > The `ok: false` branch is an **intentional product return union**, NOT an HTTP error (still `200`) — preserve V1 semantics.
- **Errors (thrown, structured):**
  - `400 { message: "Message cannot be empty", code: "message_empty", field: "content", severity: "warning" }`
  - `400 { message: "Message is too long", code: "message_too_long", field: "content", severity: "warning" }`
  - `404 { message: "Workspace not found", code: "workspace_not_found" }`
  - `401 { message, code: "unauthenticated" }`

---

### POST /threads/:id/messages
- **Auth:** Clerk JWT required
- **Rate limit:** same as `POST /threads` (`SendQuotaService.check`) + `reply_in_progress` guard via `hasActiveRun` (any `agent_runs` in `queued|running|waiting|waiting_hitl` for the thread blocks a new turn).
- **Service:** `ThreadService.sendMessage()` → `hasActiveRun()` → `checkAndConsumeSendQuota()` → `persistTurnAndDispatch()`. `agentKind` is read from the existing thread, not the request.
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
```
- **Request body:**
```ts
const Body = z.object({
  content: z.string().min(1).max(32_000),
  commandId: z.string().optional(),
  contextArtifactIds: z.array(z.string()).optional().default([]),
  contextWorkspaceIds: z.array(z.string()).optional().default([]),
});
```
- **Response 200:** identical union to `POST /threads`:
```ts
type Response =
  | { ok: true; threadId: string; messageId: string; runId: string }
  | { ok: false; reason: "rate_limited" | "quota_exceeded" | "subscription_required" | "billing_inactive" | "reply_in_progress";
      retryAt?: number; resetAt?: number; requiredPlan?: "free" | "starter" | "plus"; creditsRemaining?: number };
```
  > `reply_in_progress` is checked **before** the quota gate (so an in-flight reply does not consume credits).
- **Errors (thrown):**
  - `404 { message: "Thread not found", code: "thread_not_found" }`
  - `400 { message: "Message cannot be empty", code: "message_empty", field: "content", severity: "warning" }`
  - `400 { message: "Message is too long", code: "message_too_long", field: "content", severity: "warning" }`
  - `401 { message, code: "unauthenticated" }`

---

### DELETE /threads/:id
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.removeThread()` (was `agent.removeThread`). Deletes thread + children: `chat_messages`, `pending_interactions`, `agent_runs` (+ `agent_run_events`, `research_phase_states`), `chat_threads`. **V2 additionally cleans `research_sources` and thread-linked `artifacts`** (V1 gap). With FK cascade / a BullMQ deletion worker, the V1 bounded-batch (500/200/100) loop is dropped.
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
```
- **Request body:** none
- **Response 200:**
```ts
type Response = { ok: true };       // idempotent — ok:true even when thread is absent / not owned
```
- **Errors:** `401 { message, code: "unauthenticated" }` (ownership mismatch returns `{ ok: true }`, matching V1).

---

### GET /threads/:id/artifacts
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listArtifacts()` (was `agent.queries.listArtifacts`; reads `artifacts by_owner_thread_created`, drops `status: "deleted"`). Covers headless attachments + filed artifacts linked by `threadId`.
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
const Query  = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(50).default(50),
});
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    _id: string;                      // artifactId
    title: string;
    artifactType?:                    // optional in V1 schema
      | "markdown" | "plain_text" | "pdf" | "docx" | "html"
      | "svg" | "mermaid" | "json" | "csv" | "code" | "url";
    workspaceId?: string;             // the artifact's OWN workspace (undefined for chat-only attachments)
    source?: "manual" | "upload" | "agent" | "url";
    createdAt: number;
    updatedAt: number;
  }>;
  nextCursor: string | null;
};
```
- **Errors:** `401 { message, code: "unauthenticated" }`. Non-owned thread returns `{ items: [], nextCursor: null }`.

---

### GET /threads/:id/sources  *(deferred)*
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listSourcesByThread()` (was `agent.queries.listSourcesByThread`). PG `research_sources` is a **projection mirrored from eve** via observe-only hooks; one bounded query across all runs in the thread (each row carries `runId` for sub-agent-panel filtering; answer-level Sources list dedupes by `url`).
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
const Query  = z.object({
  cursor: z.string().nullish(),
  limit: z.number().int().min(1).max(500).default(500),
});
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    _id: string;                      // researchSources row id
    runId: string;
    usage: "candidate" | "cited" | "accepted" | "rejected";   // defaults "candidate"
    origin: "web" | "arxiv" | "doi";
    provider?: string;
    title: string;
    locator: string;
    url?: string;
    doi?: string;
    arxivId?: string;
    snippet: string;
    evidenceStrength: "strong" | "medium" | "weak";
    discoveryQuery?: string;          // RAW un-clamped search query
    createdAt: number;
  }>;
  nextCursor: string | null;
};
```
- **Errors:** `401 { message, code: "unauthenticated" }`. Non-owned thread returns `{ items: [], nextCursor: null }`.

---

### GET /threads/:id/pending-interactions
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listPendingInteractions()` (was `agent.queries.listPendingInteractions`). Elysia projection of eve interaction state into PG `pending_interactions`, so a parked HITL question stays listable/resumable outside an active eve stream (frontend polls). Returns both `pending` and `responded` rows (responded rows render read-only, keeping the question in the timeline).
- **Path params / Query:**
```ts
const Params = z.object({ id: z.string() });        // threadId
const Query  = z.object({
  limit: z.number().int().min(1).max(100).default(100),
});
```
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    id: string;                       // pendingInteractions row id
    runId: string;
    type: "ask_user" | "tool_approval";
    toolName: string;
    payloadJson: string;              // JSON string in V1 → jsonb (parsed) in V2
    status: "pending" | "responded";  // expired|superseded filtered out
    createdAt: number;
  }>;
};
```
  > Listed chronologically (V1 takes newest 100 then `.reverse()`).
- **Errors:** `401 { message, code: "unauthenticated" }`. Non-owned thread returns `{ items: [] }`.

---

### GET /send-status
- **Auth:** Clerk JWT required
- **Rate limit:** **non-consuming** read of the `sendMessage` window (does NOT call `.limit`)
- **Service:** `SendQuotaService.getSendStatus()` (was `agent.rateLimits.getSendStatus` + `getServerTime`; folds the separate `getServerTime` query into one response). Reads the Redis `sendMessage` counter for the current user; `serverTime` lets the composer correct clock skew.
- **Path params / Query:** none
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  ok: boolean;                        // true = under the per-user send window
  retryAt: number | null;             // ms; null when ok, else serverTime + retryAfter
  serverTime: number;                 // ms (Date.now())
};
```
- **Errors:** `401 { message, code: "unauthenticated" }`

---

### GET /commands  *(deferred)*
- **Auth:** Clerk JWT required
- **Rate limit:** none
- **Service:** `ThreadService.listCommands()` (was `agent.listCommands`). In V1 this proxied the agent service's `GET /commands`; in V2 the `resolveCommandDispatch` / `promptCommands` slash-command logic lives **eve-side** (composer/connection layer), so this is a **thin static api-v2 palette** sourced from the shared `promptCommands` table (the 10 commands incl. `/deep`). Client-cached via TanStack `staleTime`.
- **Path params / Query:** none
- **Request body:** none
- **Response 200:**
```ts
type Response = {
  items: Array<{
    id: string;                       // e.g. "deep-research"
    slug: string;                     // e.g. "/deep-research"
    label: string;
    description: string;
    group: "Tulis Akademik" | "Rancang Riset" | "Riset Mendalam" | "Workspace";
    aliases: string[];                // e.g. ["/deep"]
    keywords: string[];
    mode: "normal" | "deep";
    placeholder: string;
  }>;
};
```
  > V1's action returned `{ name, description, argumentHint?, scope, interceptedByService? }` from the remote service; V2 surfaces the local `promptCommands` shape instead (`id`/`slug`/`label`/`group`/`mode` etc.), since `buildPrompt` expansion happens eve-side.
- **Errors:** `401 { message, code: "unauthenticated" }`. On any failure returns `{ items: [] }` (V1 returned `[]` on non-OK / fetch error).

---

> **Eve-owned counterparts (NOT in this domain — see Domain 7).** The following V1 functions are deliberately absent from the api-v2 persistence surface because eve owns the runtime:
> - `agent.queries.listRuns` (+ per-run `agent_run_events` fan-out, the 250ms reactive re-read) → eve NDJSON session stream (`GET /eve/v1/session/:id/stream`).
> - `agent.cancelRun` / `agent.forwardCancel` → eve cancel/interrupt of the durable turn (`canceled` sticky semantics handled by eve).
> - `agent.retryRun` → eve session resume (or a fresh send-turn).
> - `agent.interactions.respond` / `forwardResume` (the HITL resume bridge) → eve `needsApproval` resume + built-in `ask_question` answer. The `respond` request union (`{ kind: "answers", answers[] }` / `{ kind: "approval", approved, note?, workspaceId? }` / `{ kind: "plan_decision", decision: "start"|"revise"|"reject", editedPlan?, revisionInstruction? }`) and the `proposeResearchPlan`-vs-other `toolName` routing guard move into eve's approval response. PG `pending_interactions` remains only as the queryable projection (`GET /threads/:id/pending-interactions` above).
> - `agent.dispatchRun` / `watchdogSweep` / `markDispatchFailed` and the `requireServiceToken agent/service.*` surface → eliminated (eve runs in-process via `withEve`; Workflow SDK durability + BullMQ stalled-job handling replace the watchdog).

---

## Agent Runtime (eve) + thin api-v2 bridge

> Domain 7 (Tier 3 — Agent Runtime). The agent **run loop, streaming, tools, subagents, HITL, and deep research are OWNED BY EVE**, mounted into `apps/web-v2` via `withEve(nextConfig)` and consumed with `useEveAgent()`; eve's `eve` channel HTTP API replaces the V1 `dispatchRun`/`forwardCancel`/`forwardResume` bridge and the `requireServiceToken` `agent/service:*` surface. The remaining **api-v2 surface is THIN**: per-thread projection reads + the resumable pending-interactions list. The two send entrypoints and thread index/history reads live in Domain 6 (Threads & Chat persistence); this section documents only the eve-runtime interactions and the api-v2 projections specific to the runtime.
>
> **Field-name provenance.** Eve owns session/turn/step durability on its own store (Workflow SDK); PG keeps only product projections mirrored via eve **observe-only** hooks: `chat_messages` (V1 `chatMessages`: `messageId`/`role`/`text`/`reasoning`/`runId`/`status`/`createdAt`), `agent_runs` (`runId`/`status`/`mode`/`agentKind`/`costUsd`/`usageJson`/`numTurns`/`errorMessage`/`verificationReportJson`), `agent_run_events` (`runId`/`seq`/`type`/`payloadJson`/`segmentId`), `research_sources`, and `pending_interactions` (`runId`/`eveRequestId`/`type`/`toolName`/`toolUseId`/`payloadJson`/`status`/`responseJson`/`respondedAt`). Run-status literals (`queued|running|waiting|waiting_hitl|completed|failed|canceled`) and run modes (`normal|deep`) are the V1 values, preserved on the `agent_runs` projection. The PG `agent_run_events.type` discriminators (`reasoning_segment`, `text_segment`, `tool_start`, `tool_end`, `subagent_start`, `subagent_stop`) are **V1 projection** values that the observe-only hook **maps eve's native NDJSON frames onto** — they are NOT eve's wire frames. eve's native stream vocabulary is documented in the stream endpoint below, with the projection mapping. **Verification status:** event **names** are verified against the bundled eve 0.11.6 docs (`concepts/sessions-runs-and-streaming.md`); eve is **not yet installed** in this repo, so the **exact payload field keys must be re-verified against `node_modules/eve` at install**.
>
> **MCP-bridge model (owner decision).** The eve agent reaches Aqsha's **own data** NOT through in-process service-layer tools, but through an **in-house Aqsha MCP server** + eve **connections** (full MCP bridge). The owner accepts the reintroduced HTTP hop (`web-v2`/eve ↔ `api-v2` MCP) for a clean, decoupled, reusable MCP boundary. The ONLY tools that remain in-process authored `tools/` are the ones that physically cannot be MCP: `verifyStatistics`/`runComputation` (need `ctx.getSandbox()`), `proposeResearchPlan` (pure HITL gate, `needsApproval`), plus eve built-ins. Every data/read/write tool moves to the connection. See **Aqsha MCP server (POST /mcp)** below.

---

### Aqsha MCP server (`POST /mcp`)  (B1 — the data bridge the eve agent connects to)
- Auth: **per-user Clerk token** — each MCP request carries `Authorization: Bearer <clerk>`; the server runs `clerk.verifyToken()` (same `@clerk/backend` client as the Elysia `authPlugin`) → `ownerUserId`. Ownership is enforced **in the service layer**, never trusted from a request body.
- Transport: **Streamable HTTP** MCP server mounted in `apps/api-v2` at `POST /mcp`. It is a **NEW thin adapter — a 4th caller** over `packages/services`, alongside the Elysia REST routes and the BullMQ workers; **all logic stays in `packages/services`** (zero duplication). It exposes two tool sets:
  - **read/research/citation set** (no approval): `list_artifacts`, `get_artifact`, `get_render_payload`, `search_thread_documents` (RAG over pgvector), `list_workspaces`, paper/explore lookups, feed reads, `search_web`, `search_arxiv`, `lookup_doi` (all via `ResearchService` with **pacer + TTL cache + server-side `consumeCredits`**), `verify_citations`, `verify_identifiers`.
  - **side-effecting set** (`aqsha_write`, approval-gated): `save_url`, `propose_artifact`, `execute_artifact`, `create_workspace`, `rename_workspace`, `link_to_workspace`, `delete_artifact`.
- Provider egress (Exa/Jina/Crossref/arXiv/OpenAlex) is wrapped by `ResearchService` and exposed **through this MCP server** — so the pacer/TTL-cache/`consumeCredits` live in **our** server (this resolves the "eve connections have no pacer/cache" concern; the cache is ours, not eve's).
- Business invariants live in the server's `execute()`, e.g. **`execute_artifact` requires an approved `propose_artifact`** (the human gate is the `aqsha_write` connection approval; the invariant is enforced by our code, not by a hook).
- **Trade-off recorded honestly:** the bridge reintroduces an HTTP hop and a 4th auth surface that the zero-RPC-hop thesis of `04-service-layer.md` originally eliminated; the owner accepted this for a reusable MCP boundary (other MCP clients can reuse the server). eve docs scope connections to "a server you don't author" — we deliberately use a connection for **our own** server.

---

### eve: POST /eve/v1/session  (start session — first turn)
- Auth: Clerk JWT required. eve's `eve` channel runs an ordered **auth walk** (`agent/channels/eve.ts`); a **first-class custom `AuthFn`** verifies the Clerk Bearer (`useEveAgent()` attaches it) and returns a `SessionAuthContext` with `principalId == ownerUserId (== identity.tokenIdentifier)`, placed ahead of `localDev()`/`vercelOidc()`. eve fails closed by default. **Route auth does NOT enforce session ownership** (per eve docs) — we enforce it ourselves: only the initiating `ownerUserId` may continue/stream a session.
- Rate limit: `SendQuotaService.check` runs in the **Domain 6** `POST /threads` entrypoint BEFORE the session is created (the api-v2 send-gate is the perimeter; eve sees only already-gated turns).
- Service: eve session runtime (replaces V1 `agent.dispatchRun` → `createRun`/`setRunStatus`/`finalizeRun`). An observe-only hook on `session.started`/`turn.started` writes the `agent_runs` projection (`status:"queued"`) and correlates the eve `sessionId` to the api-v2 `chat_threads` row.
- Path params / Query: none.
- Request body: eve's **native** body is just the message. Product correlation (threadId/runId/context) is NOT posted into eve — it is carried by the channel auth principal + channel `metadata(state)`, and persisted by the api-v2 send-gate beforehand.
```ts
const StartSessionBody = z.object({
  message: z.string().max(32_000),   // dispatchPrompt (slash-expanded; the bubble keeps displayText)
});
// Correlation (NOT in the body): ownerUserId = channel auth principal (ctx.session.auth.current.principalId).
// The api-v2 send-gate already created chat_threads + first chat_messages + queued agent_runs and stored the
// thread<->eve-session mapping; channel metadata + an observe-only hook tie eve's sessionId/runId to threadId.
// contextRefs (@artifact/@workspace) are hydrated server-side by ContextService, not sent by the client.
```
- Response 200: eve returns `sessionId` + `continuationToken` in the body, and the `x-eve-session-id` response header.
```ts
type StartSessionResponse = {
  sessionId: string;          // also the `x-eve-session-id` header; the stream/inspect handle (runtime-owned)
  continuationToken: string;  // the resume handle (channel-owned) for the next turn
};
```
- Errors:
  - 401 `{ message: "Unauthenticated (eve channel auth rejected the caller)", code: "unauthenticated", severity: "error" }` — the auth walk returned no `SessionAuthContext` (eve fails closed).
  - 409 `{ message: "A reply is already in progress", code: "reply_in_progress", severity: "info" }` — the `hasActiveRun` guard, enforced api-v2-side before handoff.

---

### eve: POST /eve/v1/session/:sessionId  (continue session — follow-up turn)
- Auth: Clerk JWT required (same auth walk; we additionally assert the caller `ownerUserId` initiated this session — eve route auth does not enforce ownership).
- Rate limit: `SendQuotaService.check` runs in the **Domain 6** `POST /threads/:id/messages` entrypoint before handoff; none eve-side.
- Service: eve session runtime resumes the durable session from its last completed step; **completed steps never re-run** (replaces the V1 `researchPhaseStates` "skip-done-phase" replay). A new `agent_runs` row for this turn is minted + correlated api-v2-side.
- Path params:
```ts
const ContinueParams = z.object({ sessionId: z.string() }); // eve sessionId (x-eve-session-id)
```
- Request body: eve's native follow-up body — the stored continuation token + the message:
```ts
const ContinueSessionBody = z.object({
  continuationToken: z.string(),         // from the start (or prior continue) response; a stale one is rejected
  message: z.string().max(32_000),
});
```
- Response 200:
```ts
type ContinueSessionResponse = {
  sessionId: string;
  continuationToken: string;   // rotated for the next turn (the prior one is now stale)
};
```
- Errors:
  - 401 `{ message: "Unauthenticated (eve channel auth rejected the caller)", code: "unauthenticated", severity: "error" }`.
  - 404 `{ message: "Session not found", code: "session_not_found" }` — `sessionId` not resolvable.
  - 409 `{ message: "A reply is already in progress", code: "reply_in_progress", severity: "info" }` — send one follow-up at a time; wait for the `session.waiting` frame.

---

### eve: GET /eve/v1/session/:sessionId/stream  (durable NDJSON event stream)
- Auth: Clerk JWT required (auth walk; we assert session ownership — eve route auth does not).
- Rate limit: none (one long-lived stream; consumed by `useEveAgent()`).
- Service: eve's **durable** NDJSON stream (replaces V1 `agent.queries.listRuns` 250ms reactive re-read + `StreamBridge`/`SegmentCoordinator`). Reasoning/tool/answer ordering comes from the stream itself. The stream is replayable; reconnect with `?startIndex=<eventCount>`. Observe-only hooks mirror frames into the `agent_run_events` projection (mapping eve's native frames → the V1 `type` discriminators + `segmentId` coalescing for the activity UI).
- Path params / Query:
```ts
const StreamParams = z.object({ sessionId: z.string() });
const StreamQuery  = z.object({ startIndex: z.coerce.number().optional() }); // reconnect by event COUNT (not a domain seq)
```
- Request body: none (GET; newline-delimited JSON, one event per line).
- Response 200: **eve's native NDJSON frames**. Event **names** are verified against the bundled eve 0.11.6 docs (`concepts/sessions-runs-and-streaming.md`); the **exact payload field keys below must be re-verified against `node_modules/eve` at install** (eve is not yet installed). The discriminant property is **`type`** (NOT `event`), and the payload lives under **`data`**; `*.appended` deltas carry both the new delta and cumulative text; the terminal frame is `session.completed`.
```ts
// eve NATIVE wire frames (what useEveAgent consumes) — NOT the V1 names. Discriminant = `type`, payload = `data`:
type EveStreamFrame =
  | { type: "session.started" | "session.waiting" | "session.completed" | "session.failed"; data: { sessionId: string } }
  | { type: "turn.started" | "turn.completed"; data: { turnId: string } }
  | { type: "turn.failed"; data: { code: string; message: string; details?: unknown } }
  | { type: "step.started" }
  | { type: "step.completed"; data: { finishReason: string; usage?: unknown } }
  | { type: "step.failed"; data: { code: string; message: string; details?: unknown } }
  | { type: "message.appended"; data: { messageDelta: string; message: string } }    // assistant text delta + cumulative
  | { type: "message.completed"; data: { message: string; finishReason: string } }   // interim narration OR terminal reply
  | { type: "reasoning.appended"; data: { reasoningDelta: string } }
  | { type: "reasoning.completed"; data: { reasoning: string } }
  | { type: "action.result"; data: { result: unknown } }                             // a tool call returned
  | { type: "input.requested"; data: { requests: HitlRequest[] } }                   // HITL: needsApproval / ask_question
  | { type: "subagent.called"; data: { name: string; toolName: string; callId: string; childSessionId: string; sequence: number } }
  | { type: "subagent.completed"; data: { subagentName: string; callId: string; output: unknown } }
  | { type: "result.completed"; data: { result: unknown } };                         // output-schema turns (/deep consolidate)

// PG projection mapping (observe-only hook -> agent_run_events.type), so the V1 activity UI is unchanged:
//   message.appended/completed   -> text_segment
//   reasoning.appended/completed -> reasoning_segment
//   action.result                -> tool_end  (the announcing assistant message carries the tool call -> tool_start)
//   subagent.called              -> subagent_start      subagent.completed -> subagent_stop
//   input.requested              -> (pending_interactions row + interaction_pending)
// A delegated subagent publishes its progress on its OWN child stream:
//   GET /eve/v1/session/<childSessionId>/stream  (the parent only emits subagent.called with childSessionId).
```
- Errors:
  - 401 `{ message: "Unauthenticated (eve channel auth rejected the caller)", code: "unauthenticated", severity: "error" }`.
  - 404 `{ message: "Session not found", code: "session_not_found" }` — unknown/foreign session.

---

### cancel / interrupt a run — client `agent.stop()`  *(verify exact interrupt API against installed eve)*
- Auth: Clerk JWT required (run ownership: `agent_runs.ownerUserId == identity.tokenIdentifier`).
- Rate limit: none.
- **Client API**: the frontend NEVER calls a `cancel()` method — `useEveAgent()` exposes **`stop()`** (with `send`, `reset`, `data`, `status`, `error`, `events`, `session`). Calling `agent.stop()` interrupts the in-flight turn.
- **Mechanism caveat**: eve 0.11.6 documents only **three** `eve`-channel HTTP routes (`POST /eve/v1/session`, `POST /eve/v1/session/:sessionId`, `GET /eve/v1/session/:sessionId/stream`) plus `GET /eve/v1/health` + `GET /eve/v1/info`. There is **no documented cancel route** — cancellation is a runtime/SDK concern surfaced by `agent.stop()`. If a server-side projection signal is needed (e.g. cancel from another device), expose it as a thin **api-v2** endpoint that signals the eve runtime; verify the exact interrupt API once eve is installed.
- Service: signal eve to interrupt + apply the projection guard (replaces V1 `agent.cancelRun` + `agent.forwardCancel`). **Durable `canceled` is sticky**: once a run flips to `canceled`, a still-streaming session must never revive it to `completed|failed` (V1 invariant preserved by the projection guard). The cancel projection also closes any `chat_messages` row still `status:"streaming"` for that `runId` (→ `complete`).
- Request body:
```ts
const CancelBody = z.object({ runId: z.string() }); // run_*
```
- Response 200:
```ts
type CancelResponse = { ok: boolean }; // idempotent: ok:true even if already completed/failed/canceled
```
- Errors:
  - 401 `{ message: "Unauthenticated", code: "unauthenticated", severity: "error" }`.
  - 404 `{ message: "Run not found", code: "run_not_found" }` — `runId` not owned/known (a missing `agent_runs` projection row).

---

### eve HITL — client `agent.send({ inputResponses })`  +  INTERNAL api-v2 translator  (HITL resume)

> **Client API (A1): there is NO `respond()`.** `useEveAgent()` exposes only `data`, `status` (`"ready"|"submitted"|"streaming"|"error"`), `error`, `events`, `session` (cursor `{ sessionId, continuationToken, streamIndex }`), `send(...)`, `stop()`, `reset()`. A parked HITL request is read off the latest message:
> ```ts
> const inputRequest = agent.data.messages.at(-1)?.parts
>   .find(p => p.type === "dynamic-tool" && p.toolMetadata?.eve?.inputRequest)
>   ?.toolMetadata.eve.inputRequest;            // { requestId, prompt, options }
> ```
> The user answers on the **SAME session**:
> - **option pick** → `await agent.send({ inputResponses: [{ requestId, optionId }] })`
> - **free text** (incl. an edited research plan) → `await agent.send({ message })`
>
> The default reducer marks the request **responded**. Persist the **whole** session cursor object via `onSessionChange`/`initialSession` (not a single field). There are no client `respond()`/`start()`/`continue()`/`cancel()` methods — a turn is started/continued with `send`, interrupted with `stop`.

The endpoint below is now an **INTERNAL api-v2 translator** (NOT a client-facing API): it exists only to bridge the product-level `pending_interactions` projection (keyed by `interactionId`) to eve's `requestId` so a parked question can be resumed **outside an active stream** (e.g. resumed from another device, or re-hydrated after reload). It resolves `interactionId → eveRequestId` and performs the equivalent `eve send({ inputResponses })` against the stored session cursor.

- Caller: **api-v2 internal only** (the web client uses `agent.send` directly when a live `useEveAgent` is attached; this translator backs the out-of-stream resume path).
- Auth: Clerk JWT required (interaction ownership: `pending_interactions.ownerUserId == identity.tokenIdentifier`).
- Rate limit: none.
- Service: `InteractionService.respond` resolves `interactionId → eveRequestId` (the new `pending_interactions.eveRequestId` projection column, mirrored from eve's `inputRequest.requestId`) and calls eve `send({ inputResponses: [{ requestId, optionId? }] })` (option pick) or `send({ message })` (free text) on the stored session cursor — eve resumes the **paused durable session** from its checkpoint (replaces V1 `agent.interactions.respond` + `agent.forwardResume` + `interactions.respondInteraction`). The response is recorded in PG **first** (`pending_interactions.status` → `responded`, `responseJson`, `respondedAt`), the answer is materialized as a real user `chat_messages` bubble (`role:"user"`, via `humanizeInteractionResponse`). `ask_user` → eve built-in `ask_question`; a `needsApproval` tool resumes approved/denied; `proposeResearchPlan` carries the `plan_decision`.
- Path params / Query: none (interaction id in body).
- Request body: a fenced `ts` block. The `kind` is guarded by interaction `type`+`toolName`: `ask_user` → `answers`; `proposeResearchPlan` tool_approval → `plan_decision`; every other tool_approval → `approval`. The translator maps each `kind` to the eve `inputResponses`/`message` shape above.
```ts
const HitlAnswer = z.object({
  prompt: z.string(),
  selectedOptionIds: z.array(z.string()).optional(),
  customAnswer: z.string().optional(),
  skipped: z.boolean().optional(),
});

const HitlResponse = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("answers"), answers: z.array(HitlAnswer) }),
  z.object({
    kind: z.literal("approval"),
    approved: z.boolean(),
    note: z.string().optional(),
    workspaceId: z.string().optional(),     // structured workspace pick from the approval card
  }),
  z.object({
    kind: z.literal("plan_decision"),       // ONLY on the proposeResearchPlan interaction
    decision: z.enum(["start", "revise", "reject"]),
    editedPlan: z.string().optional(),
    revisionInstruction: z.string().optional(),
  }),
]);

const RespondBody = z.object({
  interactionId: z.string(),   // pending_interactions.id
  response: HitlResponse,
});
```
- Response 200:
```ts
type RespondResponse = {
  ok: boolean;
  resuming: boolean;   // true when the run was waiting_hitl|waiting and eve is resuming it now
};
```
- Errors:
  - 401 `{ message: "Unauthenticated (eve channel auth rejected the caller)", code: "unauthenticated", severity: "error" }`.
  - 404 `{ message: "Interaction not found", code: "interaction_not_found" }` — unknown/foreign interaction.
  - 409 `{ message: "This request has already been handled", code: "interaction_not_pending", severity: "info" }` — status was not `pending`.
  - 400 `{ message: "This interaction expects answers", code: "interaction_response_mismatch" }` — `ask_user` got non-`answers`.
  - 400 `{ message: "This interaction expects a research-plan decision", code: "interaction_response_mismatch" }` — `proposeResearchPlan` got non-`plan_decision`.
  - 400 `{ message: "This interaction expects an approval decision", code: "interaction_response_mismatch" }` — other tool_approval got non-`approval`.

---

### eve MCP connection (`aqsha`): `search_web` / `search_arxiv` / `lookup_doi` / `search_thread_documents`
- Auth: the `aqsha` read connection (`agent/connections/aqsha.ts`, `principalType:'user'`, **no approval**) sends the user's Clerk bearer; the Aqsha MCP server runs `clerk.verifyToken()` → `ownerUserId`. Reached by qualified names `connection__aqsha__search_web` / `__search_arxiv` / `__lookup_doi` / `__search_thread_documents`. NOT an in-process `defineTool`.
- Rate limit: enforced **server-side inside the MCP server** via `ResearchService` — per-user provider buckets (V1 `limits.ts`): `externalSearchPerUser` 20/min, `arxivSearchGlobal` 1/3s, `crossrefLookupGlobal` 30/min, `jinaSearchPerUser`/`jinaReadPerUser`/`jinaRerankPerUser`, `openAlexSearchGlobal` 30/min. **The pacer + TTL cache + `consumeCredits` live in OUR MCP server** (this is why providers are reachable via a connection: the connection has no pacer/cache, but our server does). The agent's root `web_search`/`web_fetch` built-ins are disabled or approval-gated so all web egress flows through these connection tools.
- Service: `ResearchService` / `RagService` over pgvector (replaces V1 `agent/service.searchThreadDocuments` delegate to `ragContext.searchThreadDocuments` + `providers/*` + `insertSources`). The MCP server `execute()` calls the shared service directly — `packages/services` logic, zero duplication.
- Path params / Query: tool input.
```ts
const SearchToolInput = z.object({
  query: z.string(),
  threadId: z.string(),            // owner-scoping; searchThreadDocuments needs it for RAG
  maxResults: z.number().optional(),
});
```
- Request body: tool input (above); side-effect persists discovered sources (append-only; read paths dedupe by `url`).
```ts
// Each gathered source persisted to research_sources (V1 sourceCandidateValidator subset)
const ResearchSource = z.object({
  citationNumber: z.number(),
  usage: z.enum(["candidate", "cited", "accepted", "rejected"]).optional(),
  origin: z.enum(["web", "arxiv", "doi"]),
  provider: z.string().optional(),
  title: z.string(),
  locator: z.string(),
  url: z.string().optional(),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  snippet: z.string(),
  evidenceStrength: z.enum(["strong", "medium", "weak"]),
  discoveryQuery: z.string().optional(),   // RAW un-clamped search query
});
```
- Response 200: tool result (model-consumable text + structured sources).
```ts
type SearchToolResult = {
  text: string;                       // formatted findings injected into the model context
  sources: Array<z.infer<typeof ResearchSource>>;
  inserted: number;                   // count persisted to research_sources
};
```
- Errors: tool errors surface as `tool_end { isError: true }` stream frames, not HTTP status. Rate-limit hits return a non-throwing `{ retryAt }` tool result; no quota throw.

---

### verification tools — SPLIT: citations via MCP connection, stats in-process (sandbox)
> **`verify_citations` / `verify_identifiers` are MCP connection tools** (`aqsha` read set, no approval): `connection__aqsha__verify_citations` / `connection__aqsha__verify_identifiers`, served by the Aqsha MCP server over `CitationVerificationService`.
> **`verifyStatistics` / `runComputation` STAY in-process authored `tools/`** (B4/C7) — they need `ctx.getSandbox()` and cannot be MCP. They own the single deny-all docker sandbox at the root agent; the model/subagent calls them directly.

- Auth: citation tools → `aqsha` connection (user Clerk bearer) → MCP server `clerk.verifyToken()`. Stats tools → in-process trust boundary (session owner). `runComputation` is `needsApproval`-gated (a real eve gate; resumed via the HITL `send({ inputResponses })` path).
- Rate limit: `sandboxComputePerUser` 5/min (sandbox runs, in-process), `citationVerifyPerUser` 10/min (server-side in the MCP server, V1 `limits.ts`).
- Service: `CitationVerificationService` (in the MCP server) + `SandboxService` (in-process); sandbox tools call `ctx.getSandbox()` (eve `defineSandbox(docker())` on the VPS replaces `@daytona/sdk`). Usage-tracked; `citation_verify` is **not credit-charged** (V1 invariant), `sandbox_compute` is metered. Deep-research verification subagents (`counter-evidence`/`citation-verifier`) reach the citation tools via the `aqsha` connection and the stats tools in-process.
- Path params / Query: tool input.
```ts
// citation set (MCP connection — aqsha): doi/arxivId/title references
// stats set (in-process — root): statistics block / runComputation code
const VerifyToolInput = z.object({
  threadId: z.string(),
  citations: z.array(z.object({ doi: z.string().optional(), arxivId: z.string().optional(), title: z.string().optional() })).optional(), // -> connection__aqsha__verify_citations/_identifiers
  statistics: z.string().optional(),   // -> in-process verifyStatistics (statcheck/GRIM)
  code: z.string().optional(),         // -> in-process runComputation (needsApproval)
});
```
- Request body: tool input (above).
- Response 200: structured verification report (mirrored to `agent_runs.verificationReportJson` via observe-only hook).
```ts
type VerifyToolResult = {
  ok: boolean;
  reportJson: string;   // persisted to agent_runs.verificationReportJson (jsonb in PG)
};
```
- Errors: tool-level via `tool_end { isError: true }`; approval denial of `runComputation` returns a non-executing `action.result { status: "responded" }` and the tool yields a denied result (eve hooks are observe-only and cannot deny — the in-execute invariant enforces it). Deferred domain (Slice 5).

---

### eve MCP connection (`aqsha_write`): `save_url` / `propose_artifact` / `execute_artifact` / `delete_artifact` / `create_workspace` / `rename_workspace` / `link_to_workspace`
- Auth: the `aqsha_write` connection (`principalType:'user'`, **approval `always()` or `once()`**) sends the user's Clerk bearer; the Aqsha MCP server runs `clerk.verifyToken()` → `ownerUserId`. Qualified names `connection__aqsha_write__propose_artifact`, `connection__aqsha_write__execute_artifact`, `connection__aqsha_write__create_workspace`, etc. NOT in-process `defineTool`s. **The human gate is the connection-level approval** — a real eve gate that pauses/resumes the durable session (NOT a hook). `execute_artifact`'s business invariant ("an approved `propose_artifact` exists for the same proposal") is enforced **inside the MCP server `execute()`** (our code), replacing the V1-style "double-gate because hooks can't deny".
- Rate limit: none (gated by the connection approval + per-feature credits already consumed at send-time).
- Service: shared `ArtifactService` / `WorkspaceService` in the MCP server (replaces V1 `agent/service.applyArtifactAction` + `applyWorkspaceAction` + `tools/artifacts.ts`/`workspace.ts`). Agent-written artifacts are **born headless** (`workspaceId=null`, `threadId` set), later filed via Domain 5 `POST /artifacts/:id/link-workspace` (or the `link_to_workspace` write tool).
- Path params / Query: tool input.
```ts
const ArtifactToolInput = z.object({
  action: z.enum(["create", "update", "delete"]),
  artifactId: z.string().optional(),                 // required for update/delete
  workspaceId: z.string().optional(),                // honored if supplied; never auto-defaulted
  title: z.string().optional(),
  artifactType: z.enum(["markdown", "plain_text", "html", "svg", "mermaid", "json", "csv", "code"]).optional(),
  content: z.string().optional(),
});

const WorkspaceToolInput = z.object({
  action: z.enum(["create", "rename"]),
  name: z.string().optional(),
  emoji: z.string().optional(),
  workspaceId: z.string().optional(),                // required for rename
});
```
- Request body: tool input (above).
- Response 200: return-union (V1 `applyArtifactAction`/`applyWorkspaceAction` shapes preserved — failures are returned, not thrown).
```ts
type ArtifactToolResult =
  | { ok: true; artifactId: string }
  | { ok: false; reason: string };        // e.g. "Artifact not found"

type WorkspaceToolResult =
  | { ok: true; workspaceId: string }
  | { ok: false; reason: string };        // e.g. "Workspace not found"
```
- Errors: surfaced as `{ ok: false, reason }` in the tool result + a `tool_end` frame; capacity violations (`assertWorkspaceCapacity`) and the link-time library-capacity check produce structured `appError`s on the Domain 4/5 HTTP paths, not here.

---

### eve: proposeResearchPlan gate (deep research plan approval — in-process authored tool)
- Auth: Clerk JWT required (run/interaction ownership).
- Rate limit: governed by the `deep_research` feature quota consumed at send-time (Domain 6 `SendQuotaService.check`); no separate limit.
- Service: in-process **authored** `defineTool("proposeResearchPlan", { needsApproval: once() })` (a pure HITL gate, no side effect — STAYS in-process, B4/C7, NOT MCP). `/deep` is **PURE model-driven** (C1–C5): there is **NO** deterministic `DEEP_PHASES`/`DEEP_PHASE_POLICIES`/`RunManager.executeDeepRun` orchestration and **NO** hard per-run cost ceiling. The `deep-research` SKILL playbook (`agent/skills/deep-research/SKILL.md`) tells the model to **call `proposeResearchPlan` first**; the model then decides the flow and when to delegate to subagents. The plan gate emits an `input.requested` HITL frame (`toolName: "proposeResearchPlan"`); the user resolves it via the eve HITL `send({ inputResponses })` / `send({ message })` path with `kind:"plan_decision"` semantics.
- Path params / Query: n/a (in-session tool; resolved through the eve HITL send path / internal translator).
- Request body: the approval is delivered as the `plan_decision` branch (see HITL response above): `{ decision: "start" | "revise" | "reject", editedPlan?, revisionInstruction? }` — an edited plan is just `send({ message })` free text.
- Response 200: resolution drives the session — `start` resumes into `literature`; `revise` re-runs `plan` with `revisionInstruction`; `reject` cancels the run (`agent_runs.status → canceled`).
```ts
type PlanGateResolution = { ok: true; resuming: boolean }; // mirrors RespondResponse
```
- Errors: same `interaction_response_mismatch` / `interaction_not_pending` set as the HITL response endpoint. A `reject` is a normal product outcome (canceled run), not an error.

---

### GET /threads/:id/pending-interactions  (api-v2 projection)
- Auth: Clerk JWT required (thread ownership: `chat_threads.ownerUserId == identity.tokenIdentifier`).
- Rate limit: none (frontend polls when no live eve stream is attached).
- Service: `InteractionService.listPending` (replaces V1 `agent.queries.listPendingInteractions`). Reads the PG `pending_interactions` projection mirrored from eve interaction state, so a parked question stays listable/resumable **outside** an active eve stream. Returns both `pending` and `responded` rows (`responded` rendered read-only so the question stays visible in the timeline after answering).
- Path params / Query:
```ts
const PendingParams = z.object({ id: z.string() }); // threadId (thr_*)
```
- Request body: none (GET).
- Response 200: a fenced `ts` block (newest-last; bounded). Not cursor-paginated — capped (V1 `MAX_INTERACTIONS = 100`).
```ts
type PendingInteractionsResponse = {
  items: Array<{
    id: string;                                  // pending_interactions.id
    runId: string;
    eveRequestId: string;                        // eve inputRequest.requestId — used by the INTERNAL translator to resume out-of-stream
    type: "ask_user" | "tool_approval";
    toolName: string;                            // e.g. "proposeResearchPlan", "proposeArtifact"
    payloadJson: string;                         // stored question/approval payload (jsonb-stringified)
    status: "pending" | "responded";
    createdAt: number;                           // epoch ms
  }>;
};
```
- Errors:
  - 401 `{ message: "Unauthorized", code: "unauthenticated", severity: "error" }` — no/invalid Clerk JWT.
  - Returns `{ items: [] }` (not 404) when the thread is not owned — soft ownership, matching V1 `ownedThread` returning `[]`.

---

> **Dropped vs the old draft (no V1/eve backing):** `POST /threads/:id/runs`, `GET /runs/:runId`, `DELETE /runs/:runId`, `GET /runs/:runId/events` (SSE), `GET /runs/:runId/subagents`, plus `services/agent-runner.ts` + `workers/agent-watchdog.worker.ts` — all replaced by eve. The V1 `watchdogSweep` cron (`QUEUED_STALL_MS`/`RUNNING_STALL_MS`/resume-recovery) is replaced by Workflow SDK durability + BullMQ stalled-job handling. The `requireServiceToken` `agent/service:*` surface (27 endpoints: `upsertThread`/`setThreadSession`/`setThreadStatus`/`createMessage`/`updateMessageText`/`finalizeMessage`/`listMessages`/`createRun`/`getRun`/`setRunStatus`/`finalizeRun`/`setRunVerificationReport`/`appendRunEvent`/`upsertRunEventBySegmentId`/`listRunEvents`/`createInteraction`/`getInteraction`/`respondInteraction`/`expireInteraction`/`listInteractions`/`listPendingInteractionsByRun`/`upsertResearchPhase`/`listResearchPhases`/`insertSources`/`listContextArtifacts`/`getArtifact`/`getWorkspaceManifests`/`searchThreadDocuments`) collapses into eve's in-process service layer + observe-only projection writes; the token boundary becomes an internal trust boundary inside one process. `researchPhaseStates` "skip-done-phase" replay is subsumed by eve Workflow SDK step checkpointing. The V1 deterministic deep orchestration — `DEEP_PHASES` / `DEEP_PHASE_POLICIES` / `RunManager.executeDeepRun` and the "orkestrasi deep sebagai dynamic-workflow tool" framing — is **dropped as the driver**: `/deep` is now pure model-driven via a skill + declared subagents (see Deep Research below). The `/commands` palette and slash-command split (`resolveCommandDispatch`, the 10 `promptCommands` incl `/deep`) move into the eve composer/connection layer; only a thin static `GET /commands` (Domain 6, deferred) remains.

## Deep Research (eve **skill + subagents**, model-driven; thin api-v2 reads)

> **Domain ownership.** The deep-research run loop is **owned by eve** (Domain 7 runtime) and consumed in `apps/web-v2` via `useEveAgent()` (mounted by `withEve(nextConfig)`). A `/deep` run is **one eve durable session**, but it is **PURE model-driven** (C1–C5) — there is **NO** deterministic `DEEP_PHASES` / `DEEP_PHASE_POLICIES` / `RunManager.executeDeepRun` and **NO** "dynamic-workflow tool" driver. Instead:
> - **Skill playbook** `agent/skills/deep-research/SKILL.md` (load-on-demand; frontmatter `description: "Use when the user runs /deep or asks for a thorough, citation-verified research report"`). Body = methodology only: propose a plan + plan-gate first → fan out `literature-searcher` over sub-questions → delegate to `counter-evidence`, then `citation-verifier` → write with `writer` → stop when evidence is sufficient. **The MODEL decides the flow and when to delegate** (eve dispatches parallel tool calls concurrently).
> - **Declared subagents** `agent/subagents/{literature-searcher,counter-evidence,citation-verifier,writer}/agent.ts` — each own `instructions.md` + own re-authored `tools/`; **task mode via `outputSchema`** (NO `background:false` flag); inherits **nothing** from the root (own tools/skills/connections/instructions); share executors via `packages/services`.
> - **Plan gate** = in-process authored `proposeResearchPlan` (`defineTool`, `needsApproval: once()`, no side effect); resolved via the eve HITL `send({ inputResponses })` path.
> - **Workflow tool** (experimental `ExperimentalWorkflow` from `agent/tools/workflow.ts`) = **opt-in escalation only** (model-authored JS over subagents for runtime-computed fan-out); default is plain skill+subagent delegation. It reaches only subagents (no files/network/skills/connections) and cannot read usage.
>
> **What stays REST in api-v2:** the thin product **projections** the deep-research UI lists/polls — per-thread research sources, pending HITL interactions, and the run's verification report. PG keeps only these projections (mirrored from eve via observe-only hooks + the NDJSON stream), **not** a re-hand-rolled run store.
>
> **Invariants — LOOSENED (C5).** The hard per-run cost ceiling (`ASTRA_MAX_RUN_BUDGET_USD` / `maxRunBudgetUsd`) and the per-phase turn budgets (`DEEP_PHASE_POLICIES`) are **DROPPED**. Cost control = **per-call `consumeCredits`** (each model/provider call debits, server-side in the MCP server / sandbox) + the existing **monthly `deep_research` cap** from billing + the **skill's focus guidance**. Citation-numbering stability `[n]` becomes the **`writer` subagent's responsibility (prompt)**, not an orchestrator counter. The `discoveryQuery` **raw un-clamped** persistence rule for `researchSources` is retained. eve Workflow SDK **step durability** (completed steps never re-run) is retained.
>
> All eve-channel calls are documented as the `useEveAgent` / eve-channel contract (NOT REST). Clerk JWT auth flows through the eve **channel auth** seam (`UserService.ensureCurrentUser` maps the Clerk JWT → `ownerUserId`).

---

### eve: start deep session — client `agent.send({ message: "/deep …" })`  (channel: `POST /eve/v1/session`)
- Auth: Clerk JWT required (eve channel auth maps JWT → `ownerUserId`)
- Client API (A1): the first `/deep` turn is just `await agent.send({ message })` — there is no `start()` method.
- Rate limit: gated **upstream** by api-v2 `POST /threads` → `SendQuotaService.check` (`checkAndConsumeSendQuota`: `sendMessage` 1/5s cap 2 per user + `globalSendMessage` 1000/min + `globalTokenUsage` 100000/min + `consumeCredits(deep_research)`) **before** the turn is handed to eve. The eve session itself runs no rate limiting.
- Service: eve durable session driven by the `deep-research` SKILL (model-driven; no `RunManager`/`DEEP_PHASES`). The skill instructs the model to call `proposeResearchPlan` (`needsApproval: once()`) first, so the session **pauses immediately** for the plan gate.
- Path params / Query: none.
- Request body:
```ts
const StartDeepSessionInput = z.object({
  // The /deep-stripped research question (V1: serviceCommand.args after parseServiceCommand).
  // The orchestrator persists this as the CANONICAL question (V1 deepQuestion()) — never
  // re-derived from the last user message, which after a plan decision is the materialized
  // HITL bubble ("Mulai riset dengan rencana ini.").
  question: z.string().min(1).max(32_000),
  threadId: z.string().min(1),           // thr_* (created by api-v2 POST /threads first)
  agentKind: z.enum(["lite", "pro"]),    // Aqsha product/billing concept (lite|pro saja) → memilih model statik (per declared subagent / orchestrator), BUKAN "tier" eve. "deep" bukan agentKind — Deep Research = mode (skill+subagents).
  mode: z.literal("deep"),
  // Optional @mention context for the PLAN phase only (V1 contextRefs → deepContextBlock).
  contextRefs: z
    .object({
      artifactIds: z.array(z.string()).default([]),
      workspaceIds: z.array(z.string()).default([]),
    })
    .default({ artifactIds: [], workspaceIds: [] }),
});
```
- Response 200:
```ts
type StartDeepSessionResult = {
  sessionId: string;          // x-eve-session-id (durable; replaces V1 sdkSessionId/runId)
  continuationToken: string;  // pass to continue/stream
  runId: string;              // run_* projection key (mirrored into agent_runs for history)
  status: "waiting_hitl";     // parks at the proposeResearchPlan gate on the first step
  pendingInteraction: {
    id: string;
    type: "tool_approval";
    toolName: "proposeResearchPlan";
    // payload mirrors researchPlanPayloadSchema (NOT parsed from Markdown):
    payload: { title: string; summary?: string; questions: string[] };
  };
};
```
- Errors:
  - 402 `{ message, code: "quota_exceeded", severity: "warning" }` — surfaced by the api-v2 send gate (return-union, not a throw) before eve is reached.
  - 402 `{ message, code: "subscription_required" | "billing_inactive", severity: "warning" }`.
  - 429 `{ message, code: "rate_limited", severity: "info" }` — `sendMessage` window (1/5s).
  - 409 `{ message, code: "reply_in_progress", severity: "info" }` — thread already has an active run (`hasActiveRun`).
  - 401 `{ message, code: "unauthenticated", severity: "error" }`.

---

### eve: continue deep session — client `agent.send({ message })`  (channel: `POST /eve/v1/session/:id`)
- Auth: Clerk JWT required (eve channel auth)
- Client API (A1): a follow-up `/deep` turn is `await agent.send({ message })` on the same session — there is no `continue()` method; the continuation token lives in the persisted session cursor.
- Rate limit: same upstream `SendQuotaService.check` gate (a follow-up `/deep` turn re-runs the send gate in api-v2 `POST /threads/:id/messages`).
- Service: eve durable session resume. Replaces V1 `sendMessage` → `dispatchRun` downstream dispatch.
- Path params / Query: `{ id: string }` (the `sessionId`).
- Request body:
```ts
const ContinueDeepSessionInput = z.object({
  continuationToken: z.string().min(1),
  text: z.string().min(1).max(32_000),
});
```
- Response 200:
```ts
type ContinueDeepSessionResult = {
  sessionId: string;
  continuationToken: string;
  runId: string;
  status: "running" | "waiting_hitl";
};
```
- Errors:
  - 402 / 429 / 409 / 401 — same set as start (gate runs in api-v2 first).
  - 404 `{ message, code: "session_not_found", severity: "error" }`.

---

### eve: deep session stream — `useEveAgent()` stream subscription  (channel: `GET /eve/v1/session/:sessionId/stream`)
- Auth: Clerk JWT required (eve channel auth; we assert session ownership).
- Rate limit: none (long-lived NDJSON stream).
- Service: **the same** eve durable NDJSON stream as Domain 7 (`EveStreamFrame`) — a `/deep` run is one eve session, so there is **no separate deep wire vocabulary**. **Replaces** V1 `listRuns` 250ms reactive re-read + `StreamBridge`/`SegmentCoordinator`.
- Path params / Query: `{ sessionId: string }`; reconnect via `?startIndex=<eventCount>`.
- Request body: none (GET).
- Response 200: eve's native `EveStreamFrame` (see the Domain 7 stream endpoint). There is **no deterministic phase loop** (C8) — so there are **NO `phase_start`/`phase_done` markers from an orchestrator**. Deep progress is **derived from subagent activity** and mirrored to the `agent_run_events` projection by **subagent-scoped observe-only hooks** keyed by `runId`, so the activity/sources/verification UI groups by **subagent name + tool calls**. The browser keeps **ONE `useEveAgent` on the parent**:
```ts
// DERIVED from native eve frames (NOT wire frames) → mirrored to agent_run_events.type for the deep UI:
//   subagent progress: parent emits subagent.called { childSessionId } ; ATTACH to the child stream
//     GET /eve/v1/session/<childSessionId>/stream for literature-searcher / counter-evidence / citation-verifier / writer
//     -> subagent_start / subagent_stop  (group activity by subagent name)
//   action.result                               -> tool_end (the announcing assistant message carries the tool call -> tool_start)
//   message.appended/completed, reasoning.*     -> text_segment / reasoning_segment (segmentId-coalesced)
//   input.requested                             -> interaction_pending (HITL: plan gate / ask_user / approval)
//   citation integrity rollup                   -> citation_check { checked, verified, flagged } (projection-only)
// No DeepPhase enum drives the run; the deep methodology lives in the deep-research SKILL, and the MODEL decides delegation.
```
- Errors:
  - 404 `{ message, code: "session_not_found", severity: "error" }`.
  - 401 `{ message: "Unauthenticated", code: "unauthenticated", severity: "error" }`.
  - Transient drop: eve's durable replayable stream handles reconnect via `?startIndex=<eventCount>` (no hand-rolled `runStreamWithRetry`); a dropped client simply re-attaches and replays.

---

### eve: cancel / interrupt deep session turn — client `agent.stop()`  (channel: cancel)
- Auth: Clerk JWT required (eve channel auth; owner-scoped)
- Client API (A1): cancellation is `agent.stop()` — there is no `cancel()` method.
- Rate limit: none.
- Service: eve interrupts the durable turn. **Replaces** V1 `agent.cancelRun` + `agent.forwardCancel`. The `canceled` status is **sticky/durable** (V1 `RunManager.cancelRun` flips status even with no live stream; on cancel the partial `writer`-subagent output is still finalized as the assistant message).
- Path params / Query: `{ sessionId: string }`.
- Request body:
```ts
const CancelDeepSessionInput = z.object({ sessionId: z.string().min(1) });
```
- Response 200:
```ts
type CancelDeepSessionResult = { ok: boolean; status: "canceled" };
```
- Errors:
  - 404 `{ message, code: "session_not_found", severity: "error" }`.
  - 200 `{ ok: true, status: "canceled" }` is returned idempotently if the run already terminated (V1 returns `{ ok: true }` for already-`completed`/`failed`/`canceled`).

---

### eve: plan-gate decision / HITL answer — client `agent.send({ inputResponses })` / `agent.send({ message })`  (+ INTERNAL translator)
- Client API (A1): there is **NO `respond()`**. The user resolves the plan gate / any HITL on the **same session** — an option pick via `agent.send({ inputResponses: [{ requestId, optionId }] })`, an edited plan or free-text answer via `agent.send({ message })`. The parked request (`{ requestId, prompt, options }`) is read off `agent.data.messages.at(-1).parts.find(p => p.type==='dynamic-tool' && p.toolMetadata?.eve?.inputRequest)?.toolMetadata.eve.inputRequest`. The endpoint below is the **INTERNAL api-v2 translator** (`interactionId → eveRequestId → eve send`), used only for out-of-stream resume; it is NOT a client-facing method.
- Auth: Clerk JWT required (eve channel auth; owner-scoped). V1 owner check: `interaction.ownerUserId !== user._id` → `interaction_not_found`.
- Rate limit: none.
- Service: the internal translator resolves `interactionId → pending_interactions.eveRequestId` and calls eve `send({ inputResponses })` / `send({ message })`; eve resumes the paused durable session from its checkpoint. **Replaces** V1 `agent.interactions.respond` + `agent.forwardResume` + `InteractionBroker.primeResolvedApproval` + `resolvePlanDecision`. The `plan_decision` is the deep-research gate carried on the `proposeResearchPlan` interaction; the **type↔kind guard routes on `toolName`** (V1 `interactions.respond`): `proposeResearchPlan` accepts only `plan_decision`, `ask_user` only `answers`, every other approval only `approval`. The decision drives: `start` (resume with `editedPlan ?? renderResearchPlanMarkdown(payload)`), `revise` (re-call the plan with `revisionInstruction`), `reject` (cancel run, finalize assistant message "Rencana riset ditolak…"). The answer is materialized as a real user message (V1 `humanizeInteractionResponse` + `bumpThreadOnMessage`).
- Path params / Query: none.
- Request body (`interactionResponseSchema` from `packages/agent-contracts/src/interaction.ts`; the translator maps each `kind` to eve `inputResponses`/`message`):
```ts
const RespondInput = z.object({
  interactionId: z.string().min(1), // PG pending_interactions.id
  response: z.discriminatedUnion("kind", [
    // ask_user answer (built-in ask_question):
    z.object({
      kind: z.literal("answers"),
      answers: z
        .array(
          z.object({
            prompt: z.string(),
            selectedOptionIds: z.array(z.string()).optional(),
            customAnswer: z.string().max(2_000).optional(),
            skipped: z.boolean().optional(),
          }),
        )
        .min(1),
    }),
    // generic tool_approval (executeArtifact / createWorkspace / runComputation cards):
    z.object({
      kind: z.literal("approval"),
      approved: z.boolean(),
      note: z.string().max(2_000).optional(),
      workspaceId: z.string().max(128).optional(), // structured target ws from the approval card
    }),
    // DEEP-RESEARCH plan gate (only valid on toolName === "proposeResearchPlan"):
    z.object({
      kind: z.literal("plan_decision"),
      decision: z.enum(["start", "revise", "reject"]),
      editedPlan: z.string().max(20_000).optional(),       // client-edited plan Markdown
      revisionInstruction: z.string().max(2_000).optional(),
    }),
  ]),
});
```
- Response 200:
```ts
type RespondResult = { ok: boolean; resuming: boolean }; // V1 interactions.respond return shape
```
- Errors:
  - 404 `{ message: "Interaction not found", code: "interaction_not_found", severity: "error" }`.
  - 409 `{ message: "This request has already been handled", code: "interaction_not_pending", severity: "info" }`.
  - 400 `{ message: "This interaction expects a research-plan decision", code: "interaction_response_mismatch" }` — a `plan_decision` sent to a non-`proposeResearchPlan` tool, or an `approval`/`answers` mismatch (V1 `interactions.respond` guards).

---

### eve tool (in-process) — `defineTool` `proposeResearchPlan`  (deep-research plan gate)
- Auth: internal trust boundary (runs in-process inside the eve session; no service token, no HTTP hop — replaces V1 `requireServiceToken` `agent/service.*`).
- Rate limit: none.
- Service: `defineTool("proposeResearchPlan", { needsApproval: once() })`. **Replaces** V1 `buildResearchPlanTool` + `canUseTool` interrupt. No-side-effect tool: `needsApproval` pauses the durable session and surfaces the editable plan card; the structured input becomes the interaction `payload` (no Markdown parsing).
- Path params / Query: n/a (tool input).
- Request body (tool input, V1 `proposeResearchPlan.ts` zod, narrower than the stored payload schema):
```ts
const ProposeResearchPlanInput = z.object({
  title: z.string().min(1).max(120),
  summary: z.string().max(500).optional(),
  questions: z.array(z.string().min(1).max(500)).min(3).max(6), // tool bound 3–6 (payload schema widens to 1–8)
});
```
- Response 200 (tool result; only reached on the theoretical in-window-resolve path):
```ts
type ProposeResearchPlanResult = { proposed: true; title: string; questions: string[] };
```
- Errors: none thrown by the tool; rejection/revision is carried by the `plan_decision` response above. `reject` cancels the run. There is **NO per-run budget-ceiling check** (C5 — the hard `maxRunBudgetUsd` ceiling and per-phase budgets are dropped); cost is bounded by per-call `consumeCredits` + the monthly `deep_research` cap + the skill's focus guidance.

---

### eve MCP connection (`aqsha`) — research search tools (`search_web` / `search_arxiv` / `lookup_doi` / `search_thread_documents`)
- Auth: `aqsha` read connection (user Clerk bearer → MCP server `clerk.verifyToken()`). Qualified names `connection__aqsha__search_web` etc. Used by the `literature-searcher` and `counter-evidence` subagents (declared in each subagent's connections; the root agent disables/approval-gates the built-in `web_search`/`web_fetch` so all web egress flows through these). NOT in-process `defineTool`s.
- Rate limit: provider-level pacer + TTL cache live **inside the Aqsha MCP server** (`ResearchService`), NOT in eve. `consumeCredits(external_search)` charged **server-side** per provider call.
- Service: `ResearchService.searchWeb/searchArxiv/lookupDoi` in the MCP server (V1 `searchWebProvider`/`searchArxivProvider`/`lookupDoiProvider` + `numberCandidates` + `persistSources` → `insertSources`); `RagService.searchThreadDocuments` over pgvector (V1 `store.searchThreadDocuments`). Each candidate is numbered and **persisted to `research_sources`** (best-effort; a persist failure must not break the tool result). Citation-number `[n]` stability across tools is the **`writer` subagent's responsibility** (C5), not a shared orchestrator counter.
- Path params / Query: n/a (tool inputs).
- Request body (tool inputs, V1 `research.ts` zod):
```ts
const SearchWebInput   = z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(5).optional() });
const SearchArxivInput = z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(5).optional() });
const LookupDoiInput   = z.object({ doi: z.string().min(1).max(200) });
const SearchThreadDocumentsInput = z.object({ query: z.string().min(1).max(500) });
```
- Response 200 (`searchWeb`/`searchArxiv`/`lookupDoi` return numbered `SourceCandidate[]` — `sourceCandidateSchema`; these are mirrored into `research_sources` for the `GET /threads/:id/sources` projection):
```ts
type SourceCandidate = {
  citationNumber: number;                       // [n], stable across tools this turn
  origin: "web" | "arxiv" | "doi";
  evidenceStrength: "strong" | "medium" | "weak";
  title: string;
  locator: string;
  snippet: string;
  usage?: "candidate" | "cited" | "accepted" | "rejected";
  provider?: string;
  url?: string;
  doi?: string;
  arxivId?: string;
  // raw, UN-CLAMPED single-lined search query (research_sources.discoveryQuery invariant):
  discoveryQuery?: string;
  sourceKey?: string;
  rerankScore?: number;
  metadataJson?: string;
};
// searchThreadDocuments returns a plain text excerpt:
type SearchThreadDocumentsResult = string;
```
- Errors: tools never throw to the model; a provider/persist failure degrades to an empty candidate list (`persistSources` swallows + logs). There are **no per-phase budgets** (C5 — `DEEP_PHASE_POLICIES`/`PHASE_BUDGET_EXHAUSTED_NOTE` dropped); a thin/empty search result is just a weaker evidence base the model works with, never an orchestrated run failure.

---

### eve MCP connection (`aqsha`) — citation verification tools (`verify_citations` / `verify_identifiers`)
- Auth: `aqsha` read connection (user Clerk bearer → MCP server `clerk.verifyToken()`). Qualified names `connection__aqsha__verify_citations` / `__verify_identifiers`, served by the `CitationService` four-step integrity engine in the MCP server. `verify_identifiers` is the deep citation-verification tool (the `citation-verifier` subagent's tool), runnable **before any artifact exists**. NOT in-process.
- Rate limit: `VERIFY_CONCURRENCY = 4` internal batching; `consumeCredits(citation_verify)` charged **server-side**.
- Service: `CitationService.verifyCitations` (V1 `buildCitationTools.verifyCitations`: `extractCitations(artifact.text)` then `runVerificationBatch`) and `CitationService.verifyIdentifiers` (caller-supplied reference list). Both emit a `citation.check` summary mirrored into the run projection (V1 `appendRunEvent({ type: "citation_check", payload: summary })`).
- Path params / Query: n/a (tool inputs).
- Request body (tool inputs, V1 `citations.ts` zod):
```ts
const VerifyCitationsInput = z.object({ artifactId: z.string().min(1) }); // bibliography of a finished artifact
const VerifyItem = z.object({
  title: z.string().min(1),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().optional(),
  venue: z.string().optional(),
  citation: z.number().optional(), // the [n] number, echoed back unchanged
});
const VerifyIdentifiersInput = z.object({ references: z.array(VerifyItem).min(1).max(/* MAX_CITATIONS */) });
```
- Response 200 (V1 `jsonResult` shape; `status` per item from `integrityStatusSchema`):
```ts
type CitationVerifyResult = {
  status: "completed";
  summary: { checked: number; verified: number; flagged: number }; // tally(); flagged via FLAGGED_INTEGRITY_STATUSES
  items: Array<{
    reference: string;       // ref.title
    citation?: number;       // echoed [n]
    doi?: string;
    arxivId?: string;
    status: "verified" | "metadata_mismatch" | "identifier_invalid" | "not_found" | "unverifiable";
    issues: string[];        // signals.metadataIssues
    matchedTitle?: string;
  }>;
  caveat: string;            // NEUTRAL_CAVEAT — "a flag is not an accusation"
};
// verifyCitations with no parseable bibliography:
// { status: "completed"; summary: { checked: 0, verified: 0, flagged: 0 }; note: string }
```
- Errors: `verifyCitations` returns an `errorResult` (`Artifact <id> was not found.`) when the artifact is missing rather than throwing. Per-reference exceptions degrade that item to `status: "unverifiable", issues: []` (never a thrown error — discrepancy ≠ fraud).

---

### eve tools (in-process, ROOT) — statistical sandbox tools (`verifyStatistics` / `runComputation`)  (deferred)
> These two **STAY in-process authored `tools/`** (B4/C7) — they cannot be MCP because they need `ctx.getSandbox()`. They are **root** tools that own the **single deny-all docker sandbox** (`defineSandbox(docker())`: the `docker()` factory leaves egress open so `bootstrap()` can install R/packages, then `onSession({use}) => await use({networkPolicy:'deny-all'})` enforces deny-all at session start). The model and the deep subagents call them directly.
- Auth: internal trust boundary (in-process eve `defineTool.execute()` → `SandboxService` via `ctx.getSandbox()` — eve `defineSandbox docker()` on the VPS replaces `@daytona/sdk`).
- Rate limit: `consumeCredits(sandbox_compute)` charged by the service.
- Service: `SandboxService.verifyStatistics` / `SandboxService.runComputation` (V1 `buildSandboxTools`). `verifyStatistics` is read-only auto-execute; **`runComputation` is `needsApproval`-gated** (a real eve gate that pauses/resumes the durable session). `verifyStatistics` persists its report onto the run (`agent_runs.verificationReportJson`, V1 `setRunVerificationReport`).
- Path params / Query: n/a (tool inputs).
- Request body (tool inputs, V1 `sandbox.ts` zod):
```ts
const VerifyStatisticsInput = z.object({ artifactId: z.string().min(1) });
const RunComputationInput = z.object({
  computationKind: z.enum(["stat_verification", "meta_analysis", "data_analysis"]),
  artifactId: z.string().optional(),
  prompt: z.string().max(4_000).optional(),
});
```
- Response 200 (`verifyStatistics` persists then returns the `VerificationReport` — `verificationReport.ts`):
```ts
type VerificationReport = {
  artifactId: string;
  verdict: "passed" | "passed_with_notes" | "needs_review" | "failed";
  statistics: OutcomeSummary; // { checked, verified?, discrepant, notComputable, decisionErrors, ... }
  byKind: Record<"statcheck" | "grim" | "grimmer" | "power", OutcomeSummary>;
  sandboxRunIds: string[];
};
// runComputation returns the raw SandboxService.runComputation result.
```
- Errors: `verifyStatistics` returns an `errorResult` when the artifact is missing. A sandbox/infra failure yields `verdict: "failed"` (the only failed verdict) — never a thrown error.

---

### eve MCP connection (`aqsha_write`) — deep-research write tools (`propose_artifact` / `execute_artifact`)
- Auth: `aqsha_write` connection (user Clerk bearer → MCP server `clerk.verifyToken()`, `principalType:'user'`, approval `always()`/`once()`). Qualified names `connection__aqsha_write__propose_artifact` / `__execute_artifact`. Used by the `writer` subagent to deliver the report as a workspace artifact. NOT in-process.
- Rate limit: library capacity charged at file-time (`assertLibraryCapacity` in `ArtifactService`, server-side).
- Service: `ArtifactService.applyArtifactAction` in the MCP server (V1 `agent/service.applyArtifactAction`). **Human gate = the `aqsha_write` connection approval** (a real eve gate, NOT a hook); the business invariant that `execute_artifact` requires an approved `propose_artifact` is enforced **inside the MCP server `execute()`** (our code). Born headless (`workspaceId = null`, `threadId` set), then filed via `POST /artifacts/:id/link-workspace` (Domain 5) or the `link_to_workspace` write tool.
- Request body / Response 200 / Errors: see **Domain 5 (Artifacts & Library)** — `propose_artifact`/`execute_artifact` are documented there as the agent-write seam; here they are only invoked by the deep `writer` subagent.

---

### GET /threads/:id/pending-interactions  (Elysia projection)
- Auth: Clerk JWT required
- Rate limit: none (polled read)
- Service: `InteractionService.listPendingByThread()` (V1 `agent.queries.listPendingInteractions`). Mirrored from eve interaction state into PG so a **parked plan card / ask_user question stays listable and resumable outside an active eve stream** (the frontend polls this when no stream is open). Owner-gated; returns `pending` **and** `responded` rows (a responded question stays visible in the timeline, rendered read-only — V1 invariant).
- Path params / Query: `{ id: string }` (the `threadId`, `thr_*`).
- Request body: none (GET).
- Response 200 (V1 `listPendingInteractions` projection; capped 100 newest, returned chronologically — V2 should add cursor pagination):
```ts
type PendingInteractionsResult = {
  items: Array<{
    id: string;                          // pending_interactions.id
    runId: string;
    type: "ask_user" | "tool_approval";
    toolName: string;                    // e.g. "proposeResearchPlan"
    payloadJson: string;                 // JSON string; parse via parseResearchPlanPayload for the plan card
    status: "pending" | "responded";
    createdAt: number;                   // epoch ms
  }>;
  nextCursor: string | null;
};
```
- Errors:
  - 200 with `{ items: [], nextCursor: null }` when the thread is not owned (V1 returns `[]` on non-owned thread — soft, not a throw).
  - 401 `{ message, code: "unauthenticated", severity: "error" }`.

---

### GET /threads/:id/sources  (Elysia projection)  (deferred)
- Auth: Clerk JWT required
- Rate limit: none (read)
- Service: `ResearchSourceService.listByThread()` (V1 `agent.queries.listSourcesByThread`). The deep-research **Sources list + per-subagent panels** read this; sources are mirrored from eve (the research tools' `insertSources` writes) into `research_sources`. One bounded query across **all runs in the thread** — each row carries its `runId` so the sub-agent detail panel filters by run and the answer-level Sources list dedupes by `url`.
- Path params / Query: `{ id: string }` (the `threadId`).
- Request body: none (GET).
- Response 200 (V1 `listSourcesByThread` projection; capped 500 — V2 should add cursor pagination):
```ts
type ThreadSourcesResult = {
  items: Array<{
    _id: string;                                  // research_sources.id
    runId: string;
    usage: "candidate" | "cited" | "accepted" | "rejected"; // defaults "candidate"
    origin: "web" | "arxiv" | "doi";
    provider?: string;
    title: string;
    locator: string;
    url?: string;
    doi?: string;
    arxivId?: string;
    snippet: string;
    evidenceStrength: "strong" | "medium" | "weak";
    discoveryQuery?: string;                      // raw un-clamped query (sub-agent panel prefix-join)
    createdAt: number;                            // epoch ms
  }>;
  nextCursor: string | null;
};
```
- Errors:
  - 200 with `{ items: [], nextCursor: null }` when the thread is not owned (V1 soft `[]`).
  - 401 `{ message, code: "unauthenticated", severity: "error" }`.

## Feed (Explore)

Tier 4 — Discovery. Runtime: hybrid (pure Elysia read/save/hide/search over `FeedService`/PG; hydration is BullMQ repeatable jobs; AI surfaces are thin Elysia actions calling the LLM service layer + `BillingService.consumeCredits`). No eve dependency — every endpoint below is REST.

Shared conventions for this domain:
- `discoveryItemRef` (the unified save/hide/interaction identity) is the V1 `discoveryItemRefValidator`:
  ```ts
  const DiscoveryItemRef = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("feed"), feedItemId: z.string() }),
    z.object({ kind: z.literal("paper"), paperKey: z.string() }),
  ]);
  ```
- `FeedItem` response shape is the V1 `shapeFeedItem(...)` projection: the raw `feed_items` row with the storage-internal fields stripped (`dedupeKey`, `lastSeenAt`, `createdAt`, `searchText`, `orderAt` are NOT shipped), the denormalized `primaryClaim` surfaced as `claim`, plus per-request `relevanceScore` / `reason` / `saved`. Defined once and reused by every read endpoint:
  ```ts
  const FeedClaim = z.object({
    claim: z.string(),
    verdict: z.enum(["supported","partially_supported","needs_context","unverified","contradicted"]),
    verdictSource: z.string(),
    verdictBy: z.enum(["human","ai"]),
    verdictLabelRaw: z.string(),
    publisher: z.string().optional(),
    reviewUrl: z.string().optional(),
    reviewedAt: z.number().optional(),
    evidence: z.string().optional(),
    confidence: z.number().optional(),
    severity: z.enum(["info","warning","high"]).optional(),
    claimant: z.string().optional(),
    claimDate: z.number().optional(),
    supportingPaperKeys: z.array(z.string()).optional(),
  });

  const FeedItem = z.object({
    _id: z.string(),                       // feed_items PK
    kind: z.enum(["paper","news","claim","topic","idea"]),
    title: z.string(),
    summary: z.string(),
    tldr: z.string().optional(),
    tldrId: z.string().optional(),
    titleId: z.string().optional(),
    url: z.string(),
    resolvedUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    articleText: z.string().optional(),
    enrichAttempts: z.number().optional(),
    provider: z.enum(["openalex","exa_news","google_news","gdelt","google_factcheck","turnbackhoax"]),
    sourceLabel: z.string(),
    paperKey: z.string().optional(),       // -> explore_papers.key
    doi: z.string().optional(),
    authors: z.array(z.string()).optional(),
    year: z.number().optional(),
    venue: z.string().optional(),
    pdfUrl: z.string().optional(),
    citedByCount: z.number().optional(),
    isOpenAccess: z.boolean().optional(),
    topics: z.array(z.string()),
    trendScore: z.number(),
    retractionStatus: z.enum(["none","concern","retracted"]).optional(),
    primaryClaim: FeedClaim.optional(),
    stanceSupporting: z.number().optional(),
    stanceContrasting: z.number().optional(),
    sparkline: z.array(z.number()).optional(),
    publishedAt: z.number().optional(),
    // per-request enrichments
    claim: FeedClaim.optional(),           // == primaryClaim, surfaced for the card
    relevanceScore: z.number().optional(), // 0..100
    reason: z.string().optional(),         // "why am I seeing this" (Bahasa Indonesia)
    saved: z.boolean().optional(),
  });
  ```
- All timestamps are epoch-ms `number` (preserve V1 contract). Cursor lists use `{ items, nextCursor }`; `nextCursor: null` when `isDone`.
- All read/write endpoints require a synced Clerk user; the service resolves `ownerUserId == identity.tokenIdentifier` and gates with the equivalent of V1 `requireCurrentUser(ctx)`.

---

### GET /feed
Cursor-paginated cross-kind discovery feed for infinite scroll (For You/Top/Topics), keyset over the `by_order` index (`order_at` desc), re-ranked interest-aware per page. The **primary `/app/explore` surface** (matches 02-api-domains Domain 8).
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getFeedPaginated()` (V1 `feed.getFeedPaginated`)
- Path params / Query:
  ```ts
  z.object({
    cursor: z.string().optional(),                              // keyset over order_at desc; omit for first page
    limit: z.coerce.number().int().min(1).max(40).optional(),   // numItems; default 40
    mode: z.enum(["foryou","top","topics"]).optional(),         // default "foryou"
    kinds: z.array(z.enum(["paper","news","claim","topic","idea"])).optional(),
    topic: z.enum(["sains_teknologi","kesehatan","lingkungan","sosial_ekonomi","pendidikan"]).optional(), // only when mode="topics"
  })
  ```
  Note: hidden + kind + topic-category filtering happens post-fetch, so a page may shrink below `limit` while `nextCursor` stays correct (client guards the auto-loadMore loop).
- Request body: none (GET)
- Response 200:
  ```ts
  z.object({
    items: z.array(FeedItem),          // relevanceScore + reason; saved omitted (always false post-bookmark-cutover)
    nextCursor: z.string().nullable(), // null when isDone
  })
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### GET /feed/home
Ranked mixed-media **bento** home feed (non-paginated, in-memory per-kind pool + deClump). Powers the threads-home teaser + explore aside. (V1 `feed.getFeed`.)
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getFeed()` (V1 `feed.getFeed`)
- Path params / Query:
  ```ts
  z.object({
    limit: z.coerce.number().int().min(1).max(80).optional(),   // default 40, hard cap 80
    kinds: z.array(z.enum(["paper","news","claim","topic","idea"])).optional(),
    serendipity: z.coerce.boolean().optional(),                  // novel-but-adjacent ranking
  })
  ```
- Request body: none (GET)
- Response 200:
  ```ts
  z.object({ items: z.array(FeedItem) })   // each carries relevanceScore + reason + saved
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### GET /feed/search
Global full-text search over cached feed items via the `search_text` tsvector/GIN index (V1 Convex `search_text` search index). Frontend augments with a live `GET /papers/search` pass for uncached papers.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.searchDiscovery()` (V1 `feed.searchDiscovery`)
- Path params / Query:
  ```ts
  z.object({
    q: z.string(),                                              // trimmed + sliced to 256 chars; empty => empty page
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(40).optional(),
    kinds: z.array(z.enum(["paper","news","claim","topic","idea"])).optional(),
    fromYear: z.coerce.number().int().optional(),               // publication-date lower bound (Date.UTC(fromYear,0,1)); undated items excluded when set
  })
  ```
- Request body: none (GET)
- Response 200:
  ```ts
  z.object({
    items: z.array(FeedItem),          // relevance order from the index; relevanceScore + reason annotated
    nextCursor: z.string().nullable(),
  })
  ```
  Empty/blank `q` returns `{ items: [], nextCursor: null }`.
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### GET /feed/saved-refs
Resolve which discovery items (feed-id and/or paper-key) the current user has saved, so the Papers search UI can filter results. Two modes: pass `itemRefs` to test specific refs, or omit for the most-recent saved set. (V1 `feed.getSavedDiscoveryRefs`; `feed.getSavedItems` is the related saved-collection list — see note below.)
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getSavedDiscoveryRefs()` (V1 `feed.getSavedDiscoveryRefs`)
- Path params / Query:
  ```ts
  z.object({
    itemRefs: z.array(DiscoveryItemRef).max(80).optional(),     // probe-specific mode (sliced to 80)
    limit: z.coerce.number().int().min(1).max(500).optional(),  // recent-set mode; default 200, cap 500
  })
  ```
- Request body: none (GET)
- Response 200: a flat list of resolved refs (each saved feed row emits its `feed` ref plus, if it has a `paperKey`, the matching `paper` ref):
  ```ts
  z.object({
    refs: z.array(z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("feed"), feedItemId: z.string() }),
      z.object({ kind: z.literal("paper"), paperKey: z.string() }),
    ])),
  })
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

> Companion `GET /feed/saved-items` (V1 `feed.getSavedItems`) — the saved-collection sidebar — returns `{ items: Array<FeedItem & { savedAt: number }> }` (`savedAt` = `saved_feed_items.created_at`), `limit` default 20 / cap 60, `saved: true` on each. Deferred per refined routes.

---

### GET /feed/hidden-refs
Mirror of `saved-refs` for hidden items (filters search results). Same two-mode shape.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getHiddenDiscoveryRefs()` (V1 `feed.getHiddenDiscoveryRefs`)
- Path params / Query:
  ```ts
  z.object({
    itemRefs: z.array(DiscoveryItemRef).max(80).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),  // default 200, cap 500
  })
  ```
- Request body: none (GET)
- Response 200:
  ```ts
  z.object({
    refs: z.array(z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("feed"), feedItemId: z.string() }),
      z.object({ kind: z.literal("paper"), paperKey: z.string() }),
    ])),
  })
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### GET /feed/:id
Single feed item (powers news/fact detail pages; the page validates `kind` and renders empty on mismatch). Returns null body / 404 when not found.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getFeedItem()` (V1 `feed.getFeedItem`)
- Path params / Query:
  ```ts
  z.object({ id: z.string() })   // feed_items id (V1 arg name: feedItemId; normalized server-side)
  ```
- Request body: none (GET)
- Response 200:
  ```ts
  FeedItem  // saved reflects the current viewer (savedFeedItems lookup)
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`
  - 404 `{ message, code: "feed_item_not_found", severity: "info" }` (V1 returns null; map malformed/unknown id to 404)

---

### GET /feed/:id/related
Same-kind related items for the detail-page "Discover more" rail (shared-topic overlap, then recency). Deferred.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.getRelatedFeedItems()` (V1 `feed.getRelatedFeedItems`)
- Path params / Query:
  ```ts
  z.object({ id: z.string() })  // path param == feedItemId
  ```
  ```ts
  z.object({ limit: z.coerce.number().int().min(1).max(8).optional() }) // default 6, cap 8
  ```
- Request body: none (GET)
- Response 200:
  ```ts
  z.object({ items: z.array(FeedItem) })  // each carries saved
  ```
  Returns `{ items: [] }` when the id is unknown.
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### GET /feed/papers-by-keys
Resolve supporting papers for the evidence drawer by canonical `explore_papers.key`. Deferred.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `PaperCacheService.papersByKeys()` (V1 `feed.papersByKeys`)
- Path params / Query:
  ```ts
  z.object({ keys: z.array(z.string()).max(12) })  // sliced to 12 server-side
  ```
- Request body: none (GET)
- Response 200: projection of `explore_papers` rows:
  ```ts
  z.object({
    papers: z.array(z.object({
      key: z.string(),
      title: z.string(),
      year: z.number().optional(),
      url: z.string(),
      citedByCount: z.number().optional(),
      isOpenAccess: z.boolean().optional(),
    })),
  })
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/discovery/save
Unified save of a feed-row OR live paper-search ref. A `paper` ref materializes the paper into `feed_items` (from `explore_papers` via `ensureFeedItemForPaperKey`) on first save, then inserts `saved_feed_items` + a `feed_interactions` `save` row + bumps interest weights `+1`. Idempotent.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.saveToWorkspace`→`FeedService.saveDiscoveryItem()` (V1 `feed.saveDiscoveryItem`; `ensureFeedItemForPaperKey` + `saveFeedItemForUser`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({ itemRef: DiscoveryItemRef })
  ```
- Response 200 (return-union, never a throw):
  ```ts
  z.object({ saved: z.boolean() })  // false if a paper ref could not be materialized (no explore_papers row)
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/discovery/unsave
Unified unsave (no materialization — resolves the existing `feed_items` row only, deletes the `saved_feed_items` row). Deferred.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.unsaveDiscoveryItem()` (V1 `feed.unsaveDiscoveryItem`; `removeSavedFeedItemForUser`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({ itemRef: DiscoveryItemRef })
  ```
- Response 200:
  ```ts
  z.object({ saved: z.literal(false) })
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/discovery/hide
Unified hide. Materializes a `paper` ref into `feed_items` so the row can be filtered from future search, inserts `hidden_feed_items` (idempotent) + a `feed_interactions` `hide` row + decays interest weights `-1`.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedService.hideDiscoveryItem()` (V1 `feed.hideDiscoveryItem`; `hideFeedItemFull`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({ itemRef: DiscoveryItemRef })
  ```
- Response 200:
  ```ts
  z.object({ ok: z.literal(true) })  // V1 returns null; surface a no-throw success envelope
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/discovery/interaction
Unified discovery telemetry/interest interaction by ref. Always appends a `feed_interactions` row; `hide` also hides the item, `save` bumps interest `+1`, `research` ("Tanya Astra") bumps `+2`, `open_evidence` is telemetry-only. Materializes a `paper` ref first.
- Auth: Clerk JWT required
- Rate limit: none
- Service: `FeedInteractionService.recordDiscoveryInteraction()` (V1 `feed.recordDiscoveryInteraction`; `recordFeedInteractionForUser`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({
    itemRef: DiscoveryItemRef,
    kind: z.enum(["save","hide","research","open_evidence"]),
  })
  ```
- Response 200:
  ```ts
  z.object({ ok: z.literal(true) })  // V1 returns null
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

> Legacy id-based mutations `feed.recordInteraction` / `feed.saveItem` / `feed.unsaveItem` / `feed.hideItem` (all keyed by a bare `feedItemId: string`) are subsumed by the `discovery/*` ref-based endpoints above; `FeedInteractionService` underpins both code paths. Not exposed as separate V2 routes.

---

### POST /feed/consensus
Consensus meter (Ya/Tidak/Mungkin) for a yes/no science question: 30-day cache (`feed_consensus` keyed by normalized `questionKey`), else `consumeCredits(normal_chat)` → OpenAlex fetch (`CONSENSUS_PAPER_LIMIT` = 10) → LLM stance classification (CHAT_LITE_MODEL). Always returns the receipt papers; never a bare gauge. Deferred.
- Auth: Clerk JWT required
- Rate limit: billing-gated — `BillingService.consumeCredits({ feature: "normal_chat", inputTokens: 900 })` on cache miss
- Service: `FeedAiService.getConsensus()` (V1 `feed.consensus.getConsensus`; `getConsensusCache`/`putConsensusCache` + `fetchOpenAlexWorksService`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({
    question: z.string(),                  // trimmed; empty => { ok:false, reason:"empty" }
    feedItemId: z.string().optional(),     // ties the meter back to a claim item's stanceSupporting/stanceContrasting
  })
  ```
- Response 200 (return-union):
  ```ts
  z.union([
    z.object({
      ok: z.literal(true),
      consensus: z.object({
        question: z.string(),
        yes: z.number(),
        no: z.number(),
        possibly: z.number(),
        total: z.number(),
        papers: z.array(z.object({
          key: z.string(),
          title: z.string(),
          stance: z.enum(["yes","no","possibly","neutral"]),
          year: z.number().optional(),
          url: z.string(),
          sourceLabel: z.string().optional(),
        })),
        cached: z.boolean(),
      }),
    }),
    z.object({
      ok: z.literal(false),
      reason: z.enum(["quota_exceeded","subscription_required","billing_inactive","empty"]),
    }),
  ])
  ```
  Billing blocks and empty-paper guardrails are return-union values, NOT thrown errors.
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/explain-relevance
"Kenapa relevan untukmu" LLM note tying an item to the user's saved interests. Cold-start (no `user_feed_interests`) returns a canned nudge without charging. Otherwise `consumeCredits(normal_chat)` + LLM. Deferred.
- Auth: Clerk JWT required
- Rate limit: billing-gated — `BillingService.consumeCredits({ feature: "normal_chat", inputTokens: 300 })` (skipped on cold start)
- Service: `FeedAiService.explainRelevance()` (V1 `feed.ai.explainRelevance`; reads `userInterestTopics`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({
    title: z.string(),
    context: z.string().optional(),         // sliced to 500 chars
    topics: z.array(z.string()).optional(),
  })
  ```
- Response 200 (return-union):
  ```ts
  z.union([
    z.object({ ok: z.literal(true), reason: z.string() }),  // <=320 chars; canned text on cold start
    z.object({ ok: z.literal(false), reason: z.enum(["quota_exceeded","subscription_required","billing_inactive"]) }),
  ])
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/explain-term
Glossary: explain an academic term in plain Bahasa Indonesia. `consumeCredits(normal_chat)` + LLM. Deferred.
- Auth: Clerk JWT required
- Rate limit: billing-gated — `BillingService.consumeCredits({ feature: "normal_chat", inputTokens: 120 })`
- Service: `FeedAiService.explainTerm()` (V1 `feed.ai.explainTerm`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({
    term: z.string(),               // trimmed + sliced to 120; empty => { ok:true, definition:"" }
    context: z.string().optional(), // sliced to 300 chars
  })
  ```
- Response 200 (return-union):
  ```ts
  z.union([
    z.object({ ok: z.literal(true), definition: z.string() }),  // <=320 chars
    z.object({ ok: z.literal(false), reason: z.enum(["quota_exceeded","subscription_required","billing_inactive"]) }),
  ])
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### POST /feed/ideas
Research-idea generator (RAG-grounded gap-finder + FINER scoring) from a feed item. `consumeCredits(normal_chat)` (token estimate ≈ `ceil(promptChars/4)+600`) + best-effort OpenAlex grounding (`GROUNDING_LIMIT` = 8) + LLM (`MAX_QUESTIONS` = 3). Deferred.
- Auth: Clerk JWT required
- Rate limit: billing-gated — `BillingService.consumeCredits({ feature: "normal_chat", inputTokens: ceil(promptChars/4)+600 })`
- Service: `FeedIdeasService.generateIdeas()` (V1 `feed.ideas.generateIdeas`; `fetchOpenAlexWorksService` + `candidatesToExplorePapers`)
- Path params / Query: none
- Request body:
  ```ts
  z.object({
    title: z.string(),                    // trimmed; empty => { ok:false, reason:"empty" }
    context: z.string().optional(),       // sliced to 800 chars
    topics: z.array(z.string()).optional(),
    feedItemId: z.string().optional(),
  })
  ```
- Response 200 (return-union):
  ```ts
  z.union([
    z.object({
      ok: z.literal(true),
      questions: z.array(z.object({
        question: z.string(),
        methodology: z.string(),
        rationale: z.string(),
        gapType: z.enum(["geografis","temporal","populasi","metodologis","integrasi","konteks"]).optional(),
        noveltyScore: z.number().min(0).max(100),       // clamped, rounded
        feasibilityScore: z.number().min(0).max(100),   // FINER, clamped
        finerNote: z.string().optional(),
        supportingSourceKeys: z.array(z.string()).optional(),  // resolved from grounding paper numbers -> explore_papers.key
      })).min(1).max(3),
    }),
    z.object({
      ok: z.literal(false),
      reason: z.enum(["quota_exceeded","subscription_required","billing_inactive","empty"]),
    }),
  ])
  ```
- Errors:
  - 401 `{ message, code: "unauthenticated", severity: "error" }`

---

### (workers, no public route) Feed hydration lanes
The invisible load-bearing piece: V1 `feed.hydrateCycle` (a single 3h cron fanning 5 staggered lanes via `scheduler.runAfter`) becomes BullMQ repeatable jobs in api-v2 workers (NOT eve — non-agent crons). Each lane is an independently-enableable repeatable job; the admin trigger is `POST /admin/feed/hydrate` (Domain 10). Every `feed_items` write goes through the shared `FeedWriteService` helper that runs `deriveOrderAt` + `deriveSearchText` (the V1 `upsertFeedItems` invariant — refreshes `order_at` + `search_text` on every upsert, dedupe by `dedupe_key`). Lanes:
- `refreshTrendingPapers` (V1 `feed.refreshTrendingPapers`) — OpenAlex trending (`TRENDING_LIMIT` 24, cap 50, `includeRetracted: true`), upserts `explore_papers` then `feed_items` (`provider: "openalex"`, `dedupeKey: "paper:<key>"`, `retractionStatus` flagged).
- `refreshTrendingTopics` (GDELT) (V1 `feed.sources.refreshTrendingTopics`).
- `refreshGoogleNews` (RSS) (V1 `feed.sources.refreshGoogleNews`).
- `refreshFactCheckClaims` (V1 `feed.claims.refreshFactCheckClaims`) — writes `kind: "claim"` items with `primaryClaim`.
- `enrichGoogleNewsArticles` (V1 `feed.sources.enrichGoogleNewsArticles`) — resolves `resolvedUrl`/`articleText`, caps via `enrichAttempts`.

Lane config + last-run state lives in the `feed_sources` PG row (`provider`, `enabled`, `cadenceMinutes`, `queryParamsJson`, `lastRunAt`, `lastStatus`, `lastFailureReason`); `cadenceMinutes` drives the BullMQ repeat interval.

---

Notes for the implementer:
- `relevant files`: `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed.ts` (all read/save/hide/search + `upsertFeedItems`/`hydrateCycle`/`refreshTrendingPapers`), `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/validators.ts` (the field source of truth), `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/model.ts` (`deriveOrderAt`/`deriveSearchText`/`FeedItem` type), `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/consensus.ts`, `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/ai.ts`, `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/ideas.ts`, `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/topicCategories.ts`, `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed/interestKeywords.ts`.
- V1 has two distinct feed functions, mapped to two routes (matching 02-api-domains Domain 8): **`GET /feed` → `feed.getFeedPaginated`** (keyset infinite-scroll, For You/Top/Topics — the primary `/app/explore` surface) and **`GET /feed/home` → `feed.getFeed`** (non-paginated bento for the threads-home teaser + explore aside). No V1 function is lost.
- Save-to-Workspace (the FolderIcon action) is NOT a feed endpoint — it delegates to `ArtifactService.saveUrl` (`POST /workspaces/:id/artifacts/url`, Domain 5). The feed-domain saves above (`/feed/discovery/save`) are the interest/`saved_feed_items` save, distinct from filing a URL artifact.
- Interest seeding (`seedFeedInterests`, `topicsForInterestFields`, `INTEREST_FIELD_TOPICS`) is shared with Onboarding (Domain 2) and Papers recommendations (Domain 9) — one `interestKeywords` SSOT in `packages/db`.

## Papers & External Cache

Domain 9 (refined routes). Runtime: pure Elysia (Bun) over PostgreSQL + Redis. `explore_papers` is the shared paper cache (`feed_items.paper_key` references `explore_papers.key`); the per-provider lookup cache (`externalLookupCache` / `provider:'explore'` waterfall) maps to Redis SETEX (or a PG `external_lookup_cache` table) with TTL by status (`ready` 24h, `empty` 1.5h, `failed` 12m — from `CACHE_TTL_BY_STATUS`). All endpoints require a synced Clerk user (`requireCurrentUser` in V1). The URL-ingest write path (`ingestUrl`/`createUrl`) physically lives in Domain 5 (Artifacts); this domain is the read/lookup spine.

Service seams: `PaperCacheService` (`upsertPaperCache` + `candidatesToExplorePapers`), `OpenAlexService` (`fetchOpenAlexWorksService`), `ExternalCacheService` (`getCache`/`putCache` over Redis), `PaperMetadataService.upsert` (the single `upsertResolvedPaperMetadata` writer enforcing `METADATA_SOURCE_RANK` monotonicity — resolver+LLM only, **no GROBID**).

---

### GET /papers/search
- Auth: Clerk JWT required
- Rate limit: per-provider pacer applied inside the service layer when a cache miss triggers a live provider call (V1 `rateLimiter` keys: `exaSearchPerUser`, `crossrefLookupGlobal`, `arxivSearchGlobal`, `jinaSearchPerUser` per `ownerUserId`/global). The HTTP endpoint itself is not separately throttled; the cache (`provider='explore'`, 24h ready TTL) absorbs repeats. Recommend a coarse Redis token bucket per `ownerUserId` (e.g. 30/min) as a V2 guard.
- Service: `ExploreService.searchPapers()` (cache read via `ExternalCacheService.getCache({ provider: 'explore', cacheKey })` → provider waterfall OpenAlex→arXiv→Jina→Crossref-DOI → `candidatesToExplorePapers` → `PaperCacheService.upsertPaperCache` + `ExternalCacheService.putCache`). Cache key from `exploreCacheKey({ mode, query, limit, fromYear, seed })` (date-bucketed `explore:v2:...`, seeded with the user's top interest topics for recommendations).
- Path params / Query:
```ts
const SearchPapersQuery = z.object({
  query: z.string().optional(),                                  // empty/omitted => recommendations mode
  limit: z.coerce.number().int().min(1).max(24).optional(),      // clampLimit; default 12
  mode: z.enum(["recommendations", "search"]).optional(),        // default: query ? "search" : "recommendations"
  fromYear: z.coerce.number().int().min(1900).max(2100).optional(), // clampFromYear; out-of-range => ignored
  interestSeed: z.coerce.boolean().optional(),                   // default true; seed empty-query recs with userInterestTopics
});
```
- Request body: none (GET)
- Response 200:
```ts
// = ExploreSearchResponse
type SearchPapersResponse = {
  items: Array<{
    key: string;                  // canonical doi:/arxiv:/title: scheme; FK target of feed_items.paper_key
    title: string;
    snippet: string;
    abstract?: string;
    url: string;
    pdfUrl?: string;
    doi?: string;
    arxivId?: string;
    openalexId?: string;
    provider: "OpenAlex" | "arXiv" | "Exa" | "Jina" | "Crossref"; // exploreProviderValidator (Title-case)
    sourceLabel: string;
    authors: string[];
    year?: number;
    publicationDate?: string;
    venue?: string;
    citedByCount?: number;
    isOpenAccess?: boolean;
    topics: string[];
    score?: number;
  }>;
  mode: "recommendations" | "search";
  query: string;                  // normalized
  providerStatus: Array<{
    provider: "OpenAlex" | "arXiv" | "Exa" | "Jina" | "Crossref";
    status: "ready" | "fallback" | "skipped" | "error";
    message?: string;
  }>;
  generatedAt: number;            // epoch ms
  cached: boolean;
};
```
- Errors:
  - 400 `{ message: "Limit must be a number", code: "explore_limit_invalid", severity: "warning", field: "limit" }` (non-finite `limit`; V1 `clampLimit` throw)
  - 401 `{ message: "Sign in to continue", code: "unauthenticated", severity: "error" }` (no/invalid Clerk JWT or unsynced user; from `requireCurrentUser`)
  - 502 `{ message: "External provider unavailable", code: "explore_provider_failed", severity: "error" }` (all providers errored AND no cache; live providers degrade into `providerStatus[].status="error"` rather than a hard fail — return 200 with empty `items` when at least one provider responds)

---

### GET /papers/:key
- Auth: Clerk JWT required
- Rate limit: none on cache hit (`explore_papers` read). On a cold miss the cold-resolver fires the same per-provider pacer as `/papers/search` (DOI lookup → OpenAlex → arXiv). Recommend a Redis per-user bucket on the miss path only.
- Service: `ExploreService.getOrFetchPaper()` — reads `PaperCacheService.getByKey(key)` (= `explore.getPaper`, `explore_papers` by `key`); on miss derives a provider probe from the canonical key (`deriveKeyProbe`: `doi:`/`arxiv:`/`title:` schemes), re-fetches, `upsertPaperCache`, and re-reads by key. The pure-read variant (`explore.getPaper`, no network) backs warm deep-links.
- Path params / Query:
```ts
const GetPaperParams = z.object({
  key: z.string().min(1),         // canonical key, e.g. "doi:10.1234/abc", "arxiv:2401.01234", "title:..."
});
const GetPaperQuery = z.object({
  fetchOnMiss: z.coerce.boolean().optional(), // default true => getOrFetchPaper; false => getPaper (cache-only)
});
```
- Request body: none (GET)
- Response 200:
```ts
// = explorePaperDetailValidator (explorePaperFields + lastSeenAt), or null on unresolved miss
type GetPaperResponse = {
  key: string;
  title: string;
  snippet: string;
  abstract?: string;
  url: string;
  pdfUrl?: string;
  doi?: string;
  arxivId?: string;
  openalexId?: string;
  provider: "OpenAlex" | "arXiv" | "Exa" | "Jina" | "Crossref";
  sourceLabel: string;
  authors: string[];
  year?: number;
  publicationDate?: string;
  venue?: string;
  citedByCount?: number;
  isOpenAccess?: boolean;
  topics: string[];
  score?: number;
  lastSeenAt: number;             // epoch ms; bumped on each cache upsert
} | null;
```
- Errors:
  - 401 `{ message: "Sign in to continue", code: "unauthenticated", severity: "error" }` (from `requireCurrentUser`)
  - 404 — V1 returns `null` (200 body `null`) when the key is unknown and unresolvable. Recommend keeping the 200-with-`null` contract for cache-only reads; for `fetchOnMiss=true` exhausting all providers, also return 200 `null` (matches `getOrFetchPaper` returning `null`), so clients branch on `null` not status.

---

### ~~GET /papers/:id/extraction-status~~ & ~~POST /papers/:id/retry-grobid~~ — **DI-DROP (GROBID dihapus)**

Kedua endpoint ini **dihapus** di V2 karena GROBID tidak lagi dipakai. **Metadata** paper di-resolve worker `paper-enrichment` (resolver-first Crossref/OpenAlex/arXiv + LLM fallback, rank `manual>resolver>llm`), dan **teks PDF** untuk RAG diekstrak **inline** (`unpdf`/`mammoth`/utf8) saat `POST /workspaces/:id/artifacts/upload`. Tidak ada lagi GROBID extraction-status yang di-poll maupun retry-grobid; `metadataSource` tidak lagi memuat `"grobid"` (set: `crossref | openalex | arxiv | datacite | semantic_scholar | manual | llm`), dan tidak ada env `GROBID_URL`/`MAX_GROBID_ATTEMPTS`. Status enrichment yang relevan ikut di `GET /artifacts/:id` / `GET /artifacts/:id/render-payload`. (Konteks: di V1 berbasis Convex pun GROBID sudah bukan jalur utama metadata.)

---

Notes for the implementer (grounded in V1):
- There is **no** `/papers/by-url`, `/papers/by-doi`, or `/papers/recent` in V1, and no `paper_authors`/`paper_citations` tables — dropped per refined routes. URL→paper resolution happens through `POST /workspaces/:id/artifacts/url` (Domain 5, `ArtifactService.saveUrl`/`ingestUrl`), and DOI/title resolution is folded into `GET /papers/:key` via the `deriveKeyProbe` scheme.
- The external lookup cache (`getCache`/`putCache` over `externalLookupCache`) has no user-facing endpoint — it is an internal `ExternalCacheService` consumed by `/papers/search`, `/papers/:key`, the feed hydration crons, and consensus/ideas grounding. Provider literal set (cache column): `openalex | crossref | arxiv | exa | jina_search | jina_read | jina_rerank | explore | paper_ingest | google_factcheck | gdelt | google_news`. Map to Redis keys `extcache:{provider}:{cacheKey}` with `EXPIRE = expiresAt - now`.
- `OPENALEX_API_KEY` is required (V1 hard-throws); surface a 503 `{ code: "openalex_unconfigured" }` at boot/health rather than per-request if absent.

Source files read: `packages/convex/convex/explore.ts`, `explore/validators.ts`, `explore/model.ts`, `papers/extractions.ts`, `agent/providers/externalProviders.ts` (getCache/putCache + provider pacers), `agent/providers/providerCache.ts` (`providerValidator`), `schema.ts` (`externalLookupCache`, `explorePapers`).

## Admin & Health

> **Net-new ops surface.** V1 Convex shipped no equivalent — observability was provided by the managed Convex dashboard, scheduled `crons.ts` jobs (`feed:hydrate-cycle`, `agent:watchdog`), and the `@convex-dev/rate-limiter` component (`limits.ts`). V2 self-hosts everything, so this domain exposes liveness/readiness probes for the three infra dependencies (**PostgreSQL 17 + Redis 7 + Cloudflare R2** — **not MinIO**), BullMQ queue/job introspection over the workers that replace the Convex crons, and a manual feed-hydration trigger that replaces the 3h `internal.feed.hydrateCycle` cron entrypoint. Rate-limit state lives in Redis counters (there is **no `rateLimits` table** in V2; the `limits.ts` bucket config — `sendMessage`, `globalSendMessage`, `globalTokenUsage`, etc. — becomes Redis key prefixes).
>
> **Admin authorization** reuses the V1 admin model verbatim (`billing/admin.ts` → `getAdminBillingOverride`): a caller is admin if their `ownerUserId`/`clerkUserId`/`email` is in an env allowlist (`AQSHA_ADMIN_OWNER_USER_IDS`, `AQSHA_ADMIN_CLERK_USER_IDS`, `AQSHA_ADMIN_EMAILS`, `AQSHA_ADMIN_USER_IDS`/`AQSHA_ADMIN_CONVEX_USER_IDS`) **or** has a mirrored `admin_entitlements` row with `enabled = true` and an admin email. `AdminAuthService.requireAdmin(identity)` is the shared guard consumed by every `/admin/*` route.

---

### GET /health
- Auth: public
- Rate limit: none (probe endpoint; intended for load balancer / uptime monitor)
- Service: `HealthService.liveness()` — no dependency checks, returns immediately if the process event loop is responsive
- Path params / Query: none
- Request body: none

```ts
// none
```

- Response 200:

```ts
const HealthLivenessResponse = z.object({
  status: z.literal("ok"),
  uptimeMs: z.number(), // process.uptime() * 1000
  now: z.number(), // Date.now() epoch ms — also serves as the server clock
});
```

- Errors: none on success path. If the process is up the handler returns `200`; an unresponsive process simply fails to answer (no structured error body). No `4xx`/`5xx` application codes are emitted by liveness.

---

### GET /health/ready
- Auth: public
- Rate limit: none (probe endpoint)
- Service: `HealthService.readiness()` — checks **PostgreSQL** (`SELECT 1` via Drizzle), **Redis** (`PING`), and **Cloudflare R2** (lightweight `HeadBucket`/`ListObjectsV2` with `MaxKeys: 1` via `@aws-sdk/client-s3`) in parallel; readiness is the logical AND of all three.
- Path params / Query:

```ts
const HealthReadyQuery = z.object({
  // optional: skip the R2 round-trip on tight-loop probes (PG+Redis only)
  skipStorage: z.coerce.boolean().optional(),
});
```

- Request body: none

```ts
// none
```

- Response 200 (all dependencies healthy):

```ts
const DependencyHealth = z.object({
  name: z.enum(["postgres", "redis", "r2"]),
  status: z.enum(["up", "down"]),
  latencyMs: z.number(),
  detail: z.string().optional(), // error string when status === "down"
});

const HealthReadyResponse = z.object({
  status: z.enum(["ready", "degraded"]),
  now: z.number(), // epoch ms
  dependencies: z.array(DependencyHealth), // [postgres, redis, r2]
});
```

- Errors:
  - `503` `{ message: "Layanan belum siap.", code: "service_not_ready", severity: "error" }` — at least one dependency is `down`; the body still returns the full `HealthReadyResponse` (`status: "degraded"`) so the caller can see *which* dependency failed in `dependencies[].detail`.

---

### GET /admin/jobs
- Auth: admin (Clerk JWT + `AdminAuthService.requireAdmin`)
- Rate limit: none (admin-only, low traffic). Optionally surfaced behind bull-board at a separate mounted path.
- Service: `AdminJobsService.listQueues()` — BullMQ introspection (`Queue.getJobCounts()` per queue) over the **five** worker queues that replace the V1 Convex crons (identical names to [01-tech-stack.md](01-tech-stack.md) / [03-architecture.md](03-architecture.md)):
  - **feed-hydration** (replaces `internal.feed.hydrateCycle`; fans out child jobs `refreshTrendingPapers`/`refreshTrendingTopics` (GDELT)/`refreshGoogleNews`/`refreshFactCheckClaims`/`enrichGoogleNewsArticles`).
  - **paper-enrichment** (resolver-first + LLM metadata fallback; **no GROBID**).
  - **url-ingestion** (`ingestUrl`).
  - **account-deletion** (replaces the synchronous `accountCleanup.cleanupUserOwnedData` cascade — now a paginated BullMQ worker).
  - **thread-title** (`generateObject` thread title after the first turn).
- Path params / Query:

```ts
const AdminJobsQuery = z.object({
  // optional filter to one queue; omitted => all queues
  queue: z.enum([
    "feed-hydration",
    "paper-enrichment",
    "url-ingestion",
    "account-deletion",
    "thread-title",
  ]).optional(),
  // optional state filter for the per-job listing
  state: z.enum(["waiting", "active", "completed", "failed", "delayed", "paused"]).optional(),
  // cursor-based pagination over the per-job listing (BullMQ start/end range cursor)
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(), // default 25
});
```

- Request body: none

```ts
// none
```

- Response 200:

```ts
const QueueJobCounts = z.object({
  queue: z.string(),
  counts: z.object({
    waiting: z.number(),
    active: z.number(),
    completed: z.number(),
    failed: z.number(),
    delayed: z.number(),
    paused: z.number(),
  }),
  // repeatable-job schedule (cadence) for cron-style queues; mirrors V1 feedSources.cadenceMinutes
  repeatable: z.array(z.object({
    name: z.string(),
    pattern: z.string().nullable(), // cron pattern, e.g. every 3h for feed-hydration
    everyMs: z.number().nullable(),
    nextRunAt: z.number().nullable(), // epoch ms
  })),
});

const AdminJobItem = z.object({
  id: z.string(), // BullMQ job id
  queue: z.string(),
  name: z.string(),
  state: z.enum(["waiting", "active", "completed", "failed", "delayed", "paused"]),
  attemptsMade: z.number(),
  timestamp: z.number(), // enqueued at, epoch ms
  processedOn: z.number().nullable(),
  finishedOn: z.number().nullable(),
  failedReason: z.string().nullable(),
});

const AdminJobsResponse = z.object({
  queues: z.array(QueueJobCounts),
  // present only when a per-job listing is requested (state/queue filter)
  jobs: z.array(AdminJobItem).optional(),
  nextCursor: z.string().nullable(),
});
```

- Errors:
  - `401` `{ message: "Masuk untuk melanjutkan.", code: "unauthenticated", severity: "error" }` — no/invalid Clerk JWT.
  - `403` `{ message: "Akses admin diperlukan.", code: "admin_required", severity: "error" }` — authenticated but not an admin per `getAdminBillingOverride`.
  - `400` `{ message: "Antrian tidak dikenal.", code: "unknown_queue", severity: "warning", field: "queue" }` — `queue` not in the known set.
  - `503` `{ message: "Antrian pekerjaan tidak tersedia.", code: "queue_unavailable", severity: "error" }` — Redis/BullMQ unreachable.

---

### POST /admin/feed/hydrate
- Auth: admin (Clerk JWT + `AdminAuthService.requireAdmin`)
- Rate limit: a coarse admin guard (e.g. 1 per 60s per admin via a Redis SETNX lock) to prevent a thundering herd — the V1 cron deliberately staggered the 5 lanes for the same reason.
- Service: `FeedHydrationService.hydrateCycle()` — enqueues the 5 feed-hydration lane jobs (the exact set the V1 `internal.feed.hydrateCycle` `scheduler.runAfter` fan-out scheduled: `refreshTrendingPapers`, `refreshTrendingTopics`, `refreshGoogleNews`, `refreshFactCheckClaims`, `enrichGoogleNewsArticles`). Mirrors the V1 return `{ scheduled: number }` (V1 returned `{ scheduled: 5 }`).
- Path params / Query: none
- Request body:

```ts
const AdminFeedHydrateBody = z.object({
  // optional subset; omitted => all 5 lanes (matches V1 hydrateCycle behavior)
  lanes: z.array(z.enum([
    "refreshTrendingPapers",
    "refreshTrendingTopics",
    "refreshGoogleNews",
    "refreshFactCheckClaims",
    "enrichGoogleNewsArticles",
  ])).optional(),
  // optional per-lane stagger override (ms); defaults to the service HYDRATE_STAGGER map
  staggerMs: z.number().int().min(0).optional(),
});
```

- Response 200:

```ts
const AdminFeedHydrateResponse = z.object({
  scheduled: z.number(), // count of lanes enqueued (V1 parity: 5 when no subset)
  jobs: z.array(z.object({
    lane: z.enum([
      "refreshTrendingPapers",
      "refreshTrendingTopics",
      "refreshGoogleNews",
      "refreshFactCheckClaims",
      "enrichGoogleNewsArticles",
    ]),
    jobId: z.string(),
    delayMs: z.number(), // applied stagger
  })),
});
```

- Errors:
  - `401` `{ message: "Masuk untuk melanjutkan.", code: "unauthenticated", severity: "error" }` — no/invalid Clerk JWT.
  - `403` `{ message: "Akses admin diperlukan.", code: "admin_required", severity: "error" }` — not an admin.
  - `409` `{ message: "Hidrasi feed sedang berjalan.", code: "hydration_in_progress", severity: "warning" }` — the admin throttle lock is held (a recent manual/cron hydrate is still running).
  - `400` `{ message: "Lane feed tidak dikenal.", code: "unknown_feed_lane", severity: "warning", field: "lanes" }` — a `lanes[]` value is outside the known set.
  - `503` `{ message: "Antrian pekerjaan tidak tersedia.", code: "queue_unavailable", severity: "error" }` — Redis/BullMQ unreachable, lanes could not be enqueued.

---

**Notes / file paths used to ground this section:**
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/crons.ts` — V1 crons (`feed:hydrate-cycle` 3h, `agent:watchdog` 5min) → BullMQ repeatable jobs surfaced by `/admin/jobs`.
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/feed.ts` (L740–771) — `hydrateCycle` returns `{ scheduled: 5 }`, fans out the 5 named lanes → `POST /admin/feed/hydrate`.
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/agent.ts` (L603+) — `watchdogSweep` (sweeps stalled `agentRuns` via `by_status_updated`) → replaced by BullMQ stalled-job handling, observable via `/admin/jobs` (`account-deletion` and other worker queues).
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/billing/admin.ts` — `getAdminBillingOverride` + env allowlists + `adminEntitlements` mirror → `AdminAuthService.requireAdmin` (admin auth for all `/admin/*`).
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/limits.ts` — `@convex-dev/rate-limiter` buckets → Redis counters in V2 (no `rateLimits` table; not exposed as a dedicated endpoint in this domain — admin rate-limit inspection maps to Redis keys).
- `/Users/vitoandareasmanik/Development/project/aqsha/packages/convex/convex/accountCleanup.ts` — `cleanupUserOwnedData` returns `{ deletedRows, deletedStorageObjects, deletedAgentThreads }` → now an `account-deletion` BullMQ worker queue visible in `/admin/jobs`.
