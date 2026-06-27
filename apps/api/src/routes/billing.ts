import { BillingService, resolveEffectivePlanKey } from "@aqsha/services";
import { Elysia, status, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

const productKeySchema = t.Union([
  t.Literal("starterMonthly"),
  t.Literal("starterYearly"),
  t.Literal("plusMonthly"),
  t.Literal("plusYearly"),
  t.Literal("ultraMonthly"),
  t.Literal("ultraYearly"),
]);

/**
 * Route billing (Domain 3). Tipis: auth → 1 service call. Logic (entitlement,
 * Mayar, mirror) hidup di `BillingService`; error → `appError` (errorPlugin global).
 * Block kuota = return-union (bukan throw) — tapi P5 belum punya caller consume.
 * `/billing/plans` publik (tanpa auth).
 *
 * Catatan model Mayar: `/portal` & `/subscription/cancel` mengirim magic-link ke
 * email → return `{ emailed: true }` (bukan redirect). `/subscription/change`
 * mengembalikan `{ url }` checkout tier baru (Mayar tak punya API change).
 */
export const billing = new Elysia({ prefix: "/billing" })
  .use(authMacro)
  // Publik — katalog plan deterministik dari PLAN_CATALOG + produk Mayar terkonfigurasi.
  .get("/plans", () => BillingService.listPlans())
  .get(
    "/current",
    ({ ownerUserId, email }) => {
      const { db } = getDb();
      return BillingService.getCurrentBilling(db, ownerUserId, email);
    },
    { auth: true },
  )
  .get(
    "/usage/activity",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return BillingService.getUsageActivity(db, ownerUserId, query.days);
    },
    { auth: true, query: t.Object({ days: t.Optional(t.Numeric()) }) },
  )
  .get(
    "/usage/current-period",
    ({ ownerUserId, email }) => {
      const { db } = getDb();
      return BillingService.getCurrentPeriod(db, ownerUserId, email);
    },
    { auth: true },
  )
  .post(
    "/checkout",
    ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      // `successUrl` = redirect balik setelah bayar (Mayar `redirectUrl`). `origin`
      // diabaikan. Plan direkonsiliasi by-amount/email di webhook payment.received.
      return BillingService.createCheckout(db, {
        ownerUserId,
        ownerEmail: email,
        productKey: body.productKey,
        successUrl: body.successUrl ?? null,
      });
    },
    {
      auth: true,
      body: t.Object({
        productKey: productKeySchema,
        origin: t.Optional(t.String()),
        successUrl: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/portal",
    ({ ownerUserId, email }) => {
      const { db } = getDb();
      return BillingService.createPortalSession(db, { ownerUserId, ownerEmail: email });
    },
    { auth: true },
  )
  .post(
    "/subscription/change",
    ({ ownerUserId, email, body }) => {
      const { db } = getDb();
      return BillingService.changeSubscription(db, {
        ownerUserId,
        ownerEmail: email,
        productKey: body.productKey,
      });
    },
    { auth: true, body: t.Object({ productKey: productKeySchema }) },
  )
  .post(
    "/subscription/cancel",
    ({ ownerUserId, email }) => {
      const { db } = getDb();
      return BillingService.cancelSubscription(db, { ownerUserId, ownerEmail: email });
    },
    { auth: true },
  )
  .post(
    "/products/sync",
    async ({ ownerUserId, email }) => {
      const { db } = getDb();
      const plan = await resolveEffectivePlanKey(db, { ownerUserId, email });
      if (plan !== "admin") {
        return status(403, { message: "Admin access required", code: "forbidden_admin_only", severity: "error" });
      }
      return BillingService.syncProducts();
    },
    { auth: true },
  );
