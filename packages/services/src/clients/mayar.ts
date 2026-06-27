import { timingSafeEqual } from "node:crypto";
import { AppError } from "@aqsha/db";
import {
  type BillingInterval,
  intervalForProductKey,
  PRODUCT_CATALOG,
  PRODUCT_KEYS,
  type ProductKey,
} from "../plan";

/**
 * Adapter Mayar (REST `fetch` langsung — TANPA SDK). Satu-satunya tempat protokol
 * Mayar dipanggil: checkout (link bayar single-payment) / customer-portal
 * (magic-link via email) / sync / verify-webhook. TANPA domain logic
 * (owner-resolution + mirror ada di BillingService).
 *
 * Model checkout (single payment, BUKAN membership hosted):
 * - Checkout = `POST /hl/v1/payment/create` → link bayar LANGSUNG per-produk
 *   (nominal dari harga plan, email prefilled, redirectUrl balik ke app). Tier
 *   membership Mayar tak punya checkout per-tier (tier BUKAN resource `product`;
 *   `GET /hl/v1/product/{tierId}` balas 404), jadi single-payment dipakai agar
 *   user langsung ke halaman bayar produk yang dipilih.
 * - Pembayaran sekali jalan (tak auto-renew): webhook `payment.received` memberi
 *   akses 1 periode; plan dipetakan by `data.amount` (harga tiap tier unik), owner
 *   by-email. Akses kedaluwarsa di currentPeriodEnd (lihat isSubscriptionExpired).
 * - Portal = magic-link email; tak ada API change/cancel.
 *
 * Server default `sandbox` (api.mayar.club); set `MAYAR_SERVER=production`
 * (api.mayar.id) untuk live.
 */
function baseUrl(): string {
  return process.env.MAYAR_SERVER === "production" ? "https://api.mayar.id" : "https://api.mayar.club";
}

/**
 * Envelope respons Mayar: HTTP code SERING 200 walau operasi gagal — status ASLI
 * ada di body `statusCode` (mis. `{statusCode:404,messages:"Not Found",data:{}}`).
 * Jangan hanya percaya `res.ok`.
 */
type MayarEnvelope = { statusCode?: number; messages?: string; message?: string; data?: unknown };

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
  const json = (await res.json().catch(() => null)) as MayarEnvelope | null;
  // Status efektif = body `statusCode` bila ada (Mayar bungkus error di HTTP 200),
  // else HTTP status. 404-in-body harus dilempar, bukan diperlakukan sukses.
  const providerStatus = json?.statusCode ?? res.status;
  const ok = res.ok && providerStatus >= 200 && providerStatus < 300;
  if (!ok) {
    throw new AppError({
      code: "billing_provider_error",
      message: json?.messages ?? json?.message ?? `Mayar API error (${providerStatus}).`,
      severity: "error",
      status: providerStatus >= 400 && providerStatus < 600 ? providerStatus : 502,
    });
  }
  return (json?.data ?? json) as T;
}

function toEnvKey(key: ProductKey): string {
  return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase();
}

/** Mayar membership-TIER id untuk productKey (env `MAYAR_<KEY>_TIER_ID`), else null. */
export function configuredTierId(productKey: ProductKey): string | null {
  const id = process.env[`MAYAR_${toEnvKey(productKey)}_TIER_ID`]?.trim();
  return id ? id : null;
}

/** Id produk membership induk (parent), env `MAYAR_MEMBERSHIP_PRODUCT_ID`. */
function membershipProductId(): string | null {
  return process.env.MAYAR_MEMBERSHIP_PRODUCT_ID?.trim() || null;
}

/**
 * Checkout tersedia? = `MAYAR_API_KEY` terkonfigurasi (createPaymentLink butuh key).
 * Dipakai `listPlans` untuk gate tombol beli di UI. Tier-id per-produk TIDAK jadi
 * syarat checkout: link bayar dibuat dinamis dari harga plan; tier-id hanya
 * fallback rekonsiliasi webhook.
 */
export function isCheckoutConfigured(): boolean {
  return Boolean(process.env.MAYAR_API_KEY?.trim());
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

type MayarProduct = { id: string; type?: string; link?: string };

export const MayarClient = {
  /**
   * Checkout = buat link pembayaran LANGSUNG per-produk via `POST /hl/v1/payment/create`
   * (single payment, BUKAN membership). User klik plan → langsung ke halaman bayar
   * produk itu (nominal terkunci dari harga plan, email/nama prefilled, balik ke
   * `redirectUrl` setelah bayar) — tanpa pilih-ulang tier di halaman Mayar.
   *
   * Konsekuensi model: pembayaran sekali jalan (tak auto-renew). Webhook
   * `payment.received` memberi akses 1 periode; rekonsiliasi plan by AMOUNT
   * (harga tiap tier unik), owner by email.
   *
   * Mayar men-dedup body identik selama 1 menit (429) → caller menyisipkan nonce
   * di `redirectUrl` agar tiap klik menghasilkan link baru.
   */
  async createPaymentLink(args: {
    email: string;
    name?: string;
    amountIdr: number;
    description: string;
    redirectUrl?: string;
  }): Promise<{ url: string }> {
    const data = await mayarFetch<{ link?: string }>("/hl/v1/payment/create", {
      method: "POST",
      body: JSON.stringify({
        name: args.name ?? args.email,
        email: args.email,
        amount: args.amountIdr,
        description: args.description,
        ...(args.redirectUrl ? { redirectUrl: args.redirectUrl } : {}),
      }),
    });
    if (!data.link) {
      throw new AppError({
        code: "billing_provider_error",
        message: "Mayar payment has no link.",
        severity: "error",
        status: 502,
      });
    }
    return { url: data.link };
  },

  /**
   * Portal pelanggan Mayar = magic-link dikirim ke email (bukan redirect URL).
   * Mayar balas 404 "Email tidak terdaftar" bila email belum jadi customer (belum
   * pernah bayar) → diterjemahkan ke `billing_portal_no_customer` (409) yang
   * actionable, bukan 404 provider mentah.
   */
  async createCustomerPortalSession(args: { email: string }): Promise<{ emailed: true }> {
    try {
      await mayarFetch("/hl/v1/customer/login/portal", {
        method: "POST",
        body: JSON.stringify({ email: args.email }),
      });
    } catch (err) {
      if (err instanceof AppError && err.status === 404) {
        throw new AppError({
          code: "billing_portal_no_customer",
          message: "Belum ada langganan Mayar untuk email ini. Mulai langganan dulu sebelum membuka portal.",
          severity: "warning",
          status: 409,
        });
      }
      throw err;
    }
    return { emailed: true };
  },

  /**
   * Health-check Mayar (admin/cron). Bila `MAYAR_MEMBERSHIP_PRODUCT_ID` diset,
   * pastikan produk itu resolve & bertipe membership; else cukup validasi
   * konektivitas list membership.
   */
  async syncProducts(): Promise<{ ok: boolean }> {
    const id = membershipProductId();
    if (!id) {
      await mayarFetch("/hl/v1/product/type/membership?page=1&pageSize=1");
      return { ok: true };
    }
    const product = await mayarFetch<MayarProduct>(`/hl/v1/product/${id}`);
    if (product?.type !== "membership") {
      throw new AppError({
        code: "billing_provider_error",
        message: `Mayar product ${id} is not a membership.`,
        severity: "error",
        status: 502,
      });
    }
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

/** Mayar tier id → productKey (reverse lookup env `MAYAR_<KEY>_TIER_ID`). undefined = tak dikenal. */
export function productKeyForMayarTierId(tierId: string): ProductKey | undefined {
  return PRODUCT_KEYS.find((key) => configuredTierId(key) === tierId);
}

/**
 * Harga unik per tier (`PRODUCT_CATALOG.displayPriceIdr`) → productKey. Fallback
 * saat webhook mengirim parent membership product id (bukan tier id). Tiap tier
 * berharga beda → pemetaan deterministik. undefined = harga tak dikenal (mis.
 * promo/diskon — jatuh ke pending reconcile).
 */
export function productKeyForAmount(amountIdr: number): ProductKey | undefined {
  return PRODUCT_KEYS.find((key) => PRODUCT_CATALOG[key].displayPriceIdr === amountIdr);
}

/**
 * Resolusi productKey dari webhook Mayar. Untuk single-payment (`payment.received`)
 * webhook TAK membawa tier id → plan ditentukan dari `amount` (harga tiap tier
 * unik). `data.productId` (bila ada — mis. event membership lama / parent id)
 * dicoba sebagai tier-id reverse-map lebih dulu. undefined = tak terpetakan
 * (event diabaikan / pending). Catatan: amount yang tak cocok harga plan mana pun
 * → undefined (pembayaran non-langganan ikut terabaikan dengan benar).
 */
export function resolveWebhookProductKey(
  productId: string | undefined,
  amountIdr: number | undefined,
): ProductKey | undefined {
  if (productId) {
    const byTier = productKeyForMayarTierId(productId);
    if (byTier) return byTier;
  }
  if (amountIdr != null) return productKeyForAmount(amountIdr);
  return undefined;
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
 * murni). Tier diturunkan via `resolveWebhookProductKey(productId, amount)`. Mayar
 * tak kirim period/subscription-id → disintesa di sini: active → period
 * `now`+interval; memberExpired → akses berakhir sekarang; memberUnsubscribed →
 * cancel di akhir period. `providerProductId` dinormalisasi ke tier id kanonik
 * (stabil lintas-renewal walau webhook kirim parent id). `null` = abaikan (event
 * tak relevan langganan atau tier tak terpetakan).
 */
export function deriveMayarMembershipEvent(
  event: string,
  productId: string | undefined,
  amountIdr: number | undefined,
  now: number,
): MayarMembershipEvent | null {
  const status = statusForMayarEvent(event);
  if (!status) return null;
  const productKey = resolveWebhookProductKey(productId, amountIdr);
  if (!productKey) return null;
  const providerProductId = configuredTierId(productKey) ?? productId ?? productKey;
  const base = { productKey, providerProductId, status };
  if (status === "active") {
    // Single-payment = akses 1 periode tanpa auto-renew → tandai cancelAtPeriodEnd
    // (UI: "berlaku sampai <end>, tidak diperpanjang otomatis"). Akses kedaluwarsa
    // saat now ≥ currentPeriodEnd via `isSubscriptionExpired` di snapshot.
    const interval = intervalForProductKey(productKey) ?? "month";
    return {
      ...base,
      currentPeriodStart: now,
      currentPeriodEnd: addInterval(now, interval),
      cancelAtPeriodEnd: true,
    };
  }
  if (event === "membership.memberExpired") {
    return { ...base, canceledAt: now, currentPeriodEnd: now };
  }
  return { ...base, canceledAt: now, cancelAtPeriodEnd: true };
}

export { PRODUCT_KEYS };
