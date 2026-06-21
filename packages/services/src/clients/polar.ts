import { AppError } from "@aqsha/db";
import { Polar } from "@polar-sh/sdk";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import { PRODUCT_KEYS, type ProductKey } from "../plan";

/**
 * Adapter Polar (SDK langsung — `@convex-dev/polar` DIHAPUS). Satu-satunya tempat
 * protokol Polar dipanggil: checkout / customer-portal / change / cancel / sync /
 * verify-webhook. TANPA domain logic (owner-resolution + mirror ada di
 * BillingService). Server default `sandbox` (dev); set `POLAR_SERVER=production`
 * untuk live.
 */
let polar: Polar | null = null;

export function getPolar(): Polar {
  if (polar) return polar;
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new AppError({
      code: "billing_not_configured",
      message: "POLAR_ACCESS_TOKEN is not configured.",
      severity: "error",
      status: 500,
    });
  }
  const server = process.env.POLAR_SERVER === "production" ? "production" : "sandbox";
  polar = new Polar({ accessToken, server });
  return polar;
}

function toEnvKey(key: ProductKey): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

/** Polar product id terkonfigurasi untuk productKey (env `POLAR_<KEY>_PRODUCT_ID`), else null. */
export function configuredProductId(productKey: ProductKey): string | null {
  const id = process.env[`POLAR_${toEnvKey(productKey)}_PRODUCT_ID`]?.trim();
  return id ? id : null;
}

export const PolarClient = {
  /** Sesi checkout hosted — `metadata.userId` + `customerExternalId` agar webhook bisa atribusi owner. */
  async createCheckoutSession(args: {
    productId: string;
    userId: string;
    email: string;
    successUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ url: string }> {
    const checkout = await getPolar().checkouts.create({
      products: [args.productId],
      successUrl: args.successUrl,
      customerEmail: args.email,
      externalCustomerId: args.userId,
      metadata: args.metadata,
    });
    return { url: checkout.url };
  },

  /** Sesi customer portal (externalCustomerId == ownerUserId). returnUrl untuk redirect balik. */
  async createCustomerPortalSession(args: { userId: string; returnUrl?: string }): Promise<{ url: string }> {
    const session = await getPolar().customerSessions.create({
      externalCustomerId: args.userId,
      ...(args.returnUrl ? { returnUrl: args.returnUrl } : {}),
    });
    return { url: session.customerPortalUrl };
  },

  /** Ganti produk langganan (upgrade/downgrade) by subscription id. */
  async changeSubscription(args: { subscriptionId: string; productId: string }): Promise<void> {
    await getPolar().subscriptions.update({
      id: args.subscriptionId,
      subscriptionUpdate: { productId: args.productId },
    });
  },

  /** Batalkan langganan: revoke segera, atau cancel di akhir period. */
  async cancelSubscription(args: { subscriptionId: string; revokeImmediately: boolean }): Promise<void> {
    if (args.revokeImmediately) {
      await getPolar().subscriptions.revoke({ id: args.subscriptionId });
      return;
    }
    await getPolar().subscriptions.update({
      id: args.subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: true },
    });
  },

  /** Sinkronisasi produk (admin/cron) — saat ini hanya validasi konektivitas. */
  async syncProducts(): Promise<{ ok: boolean }> {
    await getPolar().products.list({});
    return { ok: true };
  },

  /**
   * Verifikasi signature webhook (Standard Webhooks, constant-time via
   * `@polar-sh/sdk/webhooks`) + parse payload. Melempar AppError bila secret
   * absen (→500) atau signature invalid (→400).
   *
   * Penting: `validateEvent` memverifikasi signature DULU, baru `parseEvent`
   * (zod) atas payload. Jadi error apa pun yang BUKAN `WebhookVerificationError`
   * berarti signature SUDAH valid tapi tipe event tak dikenal SDK 0.48.1 / ada
   * schema drift → kembalikan payload MENTAH (JSON.parse) agar route bisa ack
   * 200 (ignored untuk tipe tak ditangani; field dibaca toleran). Mencegah
   * retry-storm 500 atas event yang otentik. Body raw + headers wajib.
   */
  verifyWebhook(body: string, headers: Record<string, string>): unknown {
    const secret = process.env.POLAR_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError({
        code: "billing_webhook_secret_missing",
        message: "POLAR_WEBHOOK_SECRET is not configured.",
        severity: "error",
        status: 500,
      });
    }
    try {
      return validateEvent(body, headers, secret);
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        throw new AppError({
          code: "billing_webhook_signature_invalid",
          message: "Invalid Polar webhook signature.",
          severity: "error",
          status: 400,
        });
      }
      // Signature valid (verify lolos sebelum parse) tapi payload tak ter-parse SDK
      // → kembalikan payload otentik mentah; route memutuskan handle/ignore.
      try {
        return JSON.parse(body);
      } catch {
        throw error;
      }
    }
  },
};

export { PRODUCT_KEYS };
