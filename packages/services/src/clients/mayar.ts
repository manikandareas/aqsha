import { timingSafeEqual } from "node:crypto";
import { AppError } from "@aqsha/db";
import { type BillingInterval, intervalForProductKey, PRODUCT_KEYS, type ProductKey } from "../plan";

/**
 * Adapter Mayar (REST `fetch` langsung — TANPA SDK). Satu-satunya tempat protokol
 * Mayar dipanggil: checkout (redirect ke payment link membership) / customer-portal
 * (magic-link via email) / sync / verify-webhook. TANPA domain logic
 * (owner-resolution + mirror ada di BillingService).
 *
 * Model Mayar berbeda dari Polar: recurring = produk Membership hosted, atribusi
 * by-email (webhook tak bawa userId/subscriptionId), portal = magic-link email,
 * tak ada API change/cancel. Server default `sandbox` (api.mayar.club); set
 * `MAYAR_SERVER=production` untuk live (api.mayar.id).
 */
function baseUrl(): string {
  return process.env.MAYAR_SERVER === "production" ? "https://api.mayar.id" : "https://api.mayar.club";
}

async function mayarFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const apiKey = process.env.MAYAR_API_KEY;
  if (!apiKey) {
    throw new AppError({
      code: "billing_not_configured",
      message: "MAYAR_API_KEY is not configured.",
      severity: "error",
      status: 500,
    });
  }
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const json = (await res.json().catch(() => null)) as
    | { statusCode?: number; messages?: string; message?: string; data?: unknown }
    | null;
  if (!res.ok) {
    throw new AppError({
      code: "billing_provider_error",
      message: json?.messages ?? json?.message ?? `Mayar API error (${res.status}).`,
      severity: "error",
      status: res.status >= 400 && res.status < 600 ? res.status : 502,
    });
  }
  return (json?.data ?? json) as T;
}

function toEnvKey(key: ProductKey): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

/** Mayar product id terkonfigurasi untuk productKey (env `MAYAR_<KEY>_PRODUCT_ID`), else null. */
export function configuredProductId(productKey: ProductKey): string | null {
  const id = process.env[`MAYAR_${toEnvKey(productKey)}_PRODUCT_ID`]?.trim();
  return id ? id : null;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type MayarProduct = { id: string; link?: string; linkUrl?: string; linkPayment?: string };

export const MayarClient = {
  /**
   * Checkout = redirect ke payment link produk Membership. Mayar tak punya sesi
   * checkout per-user; atribusi owner dilakukan by-email di webhook. Email
   * di-prefill best-effort (SPIKE: belum tentu dihormati hosted page standard
   * membership) — webhook tetap reconcile by customerEmail.
   */
  async createCheckoutSession(args: { productId: string; email: string }): Promise<{ url: string }> {
    const product = await mayarFetch<MayarProduct>(`/hl/v1/product/${args.productId}`);
    const link = product.linkPayment ?? product.linkUrl ?? product.link;
    if (!link) {
      throw new AppError({
        code: "billing_provider_error",
        message: "Mayar product has no payment link.",
        severity: "error",
        status: 502,
      });
    }
    // ponytail: prefill email best-effort; URL() aman utk link Mayar yang valid.
    try {
      const url = new URL(link);
      url.searchParams.set("email", args.email);
      return { url: url.toString() };
    } catch {
      return { url: link };
    }
  },

  /** Portal pelanggan Mayar = magic-link dikirim ke email (bukan redirect URL). */
  async createCustomerPortalSession(args: { email: string }): Promise<{ emailed: true }> {
    await mayarFetch("/hl/v1/customer/login/portal", {
      method: "POST",
      body: JSON.stringify({ email: args.email }),
    });
    return { emailed: true };
  },

  /** Sinkronisasi produk (admin/cron) — saat ini hanya validasi konektivitas. */
  async syncProducts(): Promise<{ ok: boolean }> {
    await mayarFetch("/hl/v1/product/type/membership?page=1&pageSize=10");
    return { ok: true };
  },

  /**
   * Verifikasi webhook Mayar. Mayar TIDAK menandatangani payload (tanpa HMAC) →
   * otentisitas dijaga via secret di path (`/webhooks/mayar/<secret>`),
   * dibandingkan constant-time dengan `MAYAR_WEBHOOK_SECRET`. Melempar AppError
   * bila secret absen (→500) atau mismatch (→400). Route melakukan `JSON.parse`
   * body sendiri (tak ada signature di body).
   *
   * ponytail: path-secret cukup untuk sandbox. Hardening produk = re-fetch
   * transaksi via Mayar API sebelum grant entitlement (TODO).
   */
  verifyWebhook(secretFromPath: string): void {
    const secret = process.env.MAYAR_WEBHOOK_SECRET;
    if (!secret) {
      throw new AppError({
        code: "billing_webhook_secret_missing",
        message: "MAYAR_WEBHOOK_SECRET is not configured.",
        severity: "error",
        status: 500,
      });
    }
    if (!safeEqual(secretFromPath, secret)) {
      throw new AppError({
        code: "billing_webhook_signature_invalid",
        message: "Invalid Mayar webhook secret.",
        severity: "error",
        status: 400,
      });
    }
  },
};

// ── Webhook mapping helpers (pure — di-unit-test terpisah) ───────────────────

export type MayarMembershipStatus = "active" | "canceled";

/**
 * Event Mayar → status mirror. `null` = abaikan (event tak relevan langganan,
 * mis. payment.reminder/shipper.status). memberExpired/Unsubscribed → canceled.
 */
export function statusForMayarEvent(event: string): MayarMembershipStatus | null {
  switch (event) {
    case "membership.newMemberRegistered":
    case "membership.changeTierMemberRegistered":
    case "payment.received":
      return "active";
    case "membership.memberUnsubscribed":
    case "membership.memberExpired":
      return "canceled";
    default:
      return null;
  }
}

/** Mayar product id → productKey terkonfigurasi (reverse lookup env). undefined = tak dikenal. */
export function productKeyForMayarId(productId: string): ProductKey | undefined {
  return PRODUCT_KEYS.find((key) => configuredProductId(key) === productId);
}

/**
 * Tambah 1 bulan/tahun (UTC) untuk period-end membership — Mayar tak kirim period
 * end. Pakai aritmetika `Date` (bukan +30d) agar batas bulan/tahun benar.
 * ponytail: hari overflow (mis. 31 Jan +1bln) ikut roll-over native JS; cukup
 * untuk tampilan periode (Mayar = SoT renewal sebenarnya).
 */
export function addInterval(nowMs: number, interval: BillingInterval): number {
  const d = new Date(nowMs);
  const monthDelta = interval === "year" ? 12 : 1;
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth() + monthDelta,
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  );
}

export type MayarMembershipEvent = {
  productKey: ProductKey;
  providerProductId: string;
  status: MayarMembershipStatus;
  currentPeriodStart?: number;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: number;
};

/**
 * Satu-satunya tempat event Mayar mentah diturunkan ke field mirror subscription
 * (menjaga invariant "protokol Mayar hanya di adapter ini" — route tetap transport
 * murni). Mayar tak kirim period/subscription-id → disintesa di sini: active →
 * period `now`+interval; memberExpired → akses berakhir sekarang; memberUnsubscribed
 * → cancel di akhir period. `null` = abaikan (event tak relevan langganan atau
 * produk tak terkonfigurasi).
 */
export function deriveMayarMembershipEvent(
  event: string,
  productId: string | undefined,
  now: number,
): MayarMembershipEvent | null {
  const status = statusForMayarEvent(event);
  if (!status || !productId) return null;
  const productKey = productKeyForMayarId(productId);
  if (!productKey) return null;
  const base = { productKey, providerProductId: productId, status };
  if (status === "active") {
    const interval = intervalForProductKey(productKey) ?? "month";
    return { ...base, currentPeriodStart: now, currentPeriodEnd: addInterval(now, interval) };
  }
  if (event === "membership.memberExpired") {
    return { ...base, canceledAt: now, currentPeriodEnd: now };
  }
  return { ...base, canceledAt: now, cancelAtPeriodEnd: true };
}

export { PRODUCT_KEYS };
