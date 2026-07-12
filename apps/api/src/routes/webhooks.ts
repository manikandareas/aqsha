import { AppError } from "@aqsha/db";
import {
  AccountDeletionService,
  BillingService,
  deriveMayarMembershipEvent,
  MayarClient,
  UserService,
} from "@aqsha/services";
import { Elysia, status } from "elysia";
import { verifyClerkWebhook } from "../clients/clerkWebhook";
import { getDb } from "../clients/db";
import { delKey, setNxWithTtl } from "../clients/redis";

const WEBHOOK_TTL_SECONDS = 60 * 60 * 24; // 24 jam ≥ jendela retry svix

/**
 * Payload webhook Mayar (`{ event, data }`). data bawa customerEmail + productId
 * (ambigu: tier id ATAU parent product id) + amount (untuk disambiguasi tier saat
 * productId = parent — lihat resolveWebhookProductKey).
 */
type MayarWebhookEvent = {
  event?: string;
  data?: {
    id?: string;
    transactionId?: string;
    customerEmail?: string;
    productId?: string;
    productType?: string;
    amount?: number | string;
  } | null;
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/** Mayar bisa kirim amount sebagai number atau string numerik. undefined bila bukan keduanya. */
function numberField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

type ClerkUserData = {
  id?: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  public_metadata?: Record<string, unknown> | null;
  deleted?: boolean;
};

/**
 * Role dari `publicMetadata.role` (di-set owner via Clerk Dashboard). Payload tanpa
 * public_metadata → null (jangan sentuh kolom role). Nilai selain "admin" → "user",
 * jadi mencabut admin cukup menghapus/mengubah metadata-nya.
 */
function pickRole(data: ClerkUserData): "user" | "admin" | null {
  if (data.public_metadata == null) return null;
  return data.public_metadata.role === "admin" ? "admin" : "user";
}

/** Email primary (cocokkan primary_email_address_id), fallback pertama, lalu null. */
function pickEmail(data: ClerkUserData): string | null {
  const list = data.email_addresses ?? [];
  if (list.length === 0) return null;
  const primary = data.primary_email_address_id
    ? list.find((e) => e.id === data.primary_email_address_id)
    : undefined;
  return (primary ?? list[0])?.email_address ?? null;
}

/**
 * Webhook Clerk. Auth = signature svix (bukan JWT). `parse: "none"` mencegah
 * Elysia meng-consume body supaya `verifyClerkWebhook(request)` bisa baca raw
 * bytes. Idempotent via Redis SETNX keyed pada header `svix-id` (delivery id;
 * wrapper webhook tak punya event id, dan data.id = user id yang sama antar event).
 */
export const webhooks = new Elysia({ prefix: "/webhooks" }).post(
  "/clerk",
  async ({ request, headers }) => {
    let evt: Awaited<ReturnType<typeof verifyClerkWebhook>>;
    try {
      evt = await verifyClerkWebhook(request);
    } catch (error) {
      if (error instanceof AppError) throw error; // secret missing → 500 via errorPlugin
      return status(400, {
        message: "Invalid Clerk webhook signature.",
        code: "clerk_webhook_invalid_signature",
      });
    }

    const type = evt.type;
    if (!type.startsWith("user.")) {
      return { ok: true, ignored: true };
    }

    const data = evt.data as unknown as ClerkUserData;
    const clerkUserId = data.id;
    if (!clerkUserId) {
      return status(400, {
        message: "Clerk webhook payload is missing user id.",
        code: "clerk_webhook_missing_user_id",
      });
    }

    const eventId = headers["svix-id"] ?? `${type}:${clerkUserId}`;
    const acquired = await setNxWithTtl(`clerk:webhook:${eventId}`, WEBHOOK_TTL_SECONDS);
    if (!acquired) {
      return { ok: true }; // delivery sama sudah diproses
    }

    const deleted = type === "user.deleted" || data.deleted === true;
    const { db } = getDb();
    if (deleted) {
      // Clerk sudah hapus user → enqueue cascade data owner (worker Clerk-delete jadi 404=ok).
      await AccountDeletionService.requestByClerkId(db, clerkUserId);
    } else {
      await UserService.applyClerkUserUpsert(db, {
        clerkUserId,
        email: pickEmail(data),
        role: pickRole(data),
      });
    }
    return { ok: true };
  },
  { parse: "none" },
).post(
  "/mayar/:secret",
  async ({ request, params }) => {
    // Mayar tak menandatangani payload → otentisitas via secret di path
    // (constant-time vs MAYAR_WEBHOOK_SECRET). verifyWebhook melempar AppError
    // (mismatch→400 / secret missing→500), di-map errorPlugin global.
    MayarClient.verifyWebhook(params.secret);

    const body = await request.text();
    let event: MayarWebhookEvent;
    try {
      event = JSON.parse(body) as MayarWebhookEvent;
    } catch {
      return status(400, {
        message: "Invalid Mayar webhook payload.",
        code: "billing_webhook_invalid_payload",
        severity: "error",
      });
    }

    // Semua derivasi protokol Mayar (event→status, produk→key, period) ada di
    // adapter `deriveMayarMembershipEvent`. Route = transport murni.
    const eventName = stringField(event.event);
    const data = event.data ?? {};
    const resolved = eventName
      ? deriveMayarMembershipEvent(eventName, stringField(data.productId), numberField(data.amount), Date.now())
      : null;
    if (!eventName || !resolved) {
      return { ok: true, ignored: true }; // event tak relevan / produk tak terkonfigurasi
    }

    const customerEmail = stringField(data.customerEmail);
    if (!customerEmail) {
      return status(400, {
        message: "Mayar webhook is missing data.customerEmail",
        code: "billing_event_missing_email",
        severity: "error",
      });
    }

    // Dedupe by (event, id); status deterministik dari event → tak perlu di key.
    // Fallback bila Mayar tak kirim id: identitas langganan (email+produk). JANGAN
    // string kosong — itu menyatukan event beda-user ber-event-name sama ke 1 key
    // (user kedua ke-dedupe → hilang).
    const dedupId =
      stringField(data.id) ??
      stringField(data.transactionId) ??
      `${customerEmail}:${resolved.providerProductId}`;
    const dedupKey = `mayar:webhook:${eventName}:${dedupId}`;
    const acquired = await setNxWithTtl(dedupKey, WEBHOOK_TTL_SECONDS);
    if (!acquired) {
      return { ok: true, deduped: true }; // event sama sudah diproses
    }

    // Period derivation pakai `now` → non-idempotent saat replay, jadi lock di atas
    // load-bearing. Lepas lock bila sync gagal supaya retry Mayar (svix) bisa proses
    // ulang alih-alih ke-dedupe dan event hilang sampai TTL.
    const { db } = getDb();
    let result: { matched: boolean };
    try {
      result = await BillingService.syncSubscriptionFromMayar(db, {
        customerEmail,
        event: eventName,
        providerProductId: resolved.providerProductId,
        productKey: resolved.productKey,
        status: resolved.status,
        currentPeriodStart: resolved.currentPeriodStart,
        currentPeriodEnd: resolved.currentPeriodEnd,
        cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
        canceledAt: resolved.canceledAt,
        rawJson: data,
      });
    } catch (err) {
      await delKey(dedupKey);
      throw err;
    }
    return { ok: true, matched: result.matched };
  },
  { parse: "none" },
);
