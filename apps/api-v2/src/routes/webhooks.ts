import { AppError } from "@aqsha/db";
import { BillingService, PolarClient, UserService } from "@aqsha/services";
import { Elysia, status } from "elysia";
import { verifyClerkWebhook } from "../clients/clerkWebhook";
import { getDb } from "../clients/db";
import { setNxWithTtl } from "../clients/redis";

const WEBHOOK_TTL_SECONDS = 60 * 60 * 24; // 24 jam ≥ jendela retry svix

/** Subset event subscription Polar yang dipakai (`subscription.created`/`updated`). */
type PolarSubscriptionEvent = {
  type: string;
  data: {
    id: string;
    productId?: string;
    status?: string;
    currentPeriodStart?: Date | string | null;
    currentPeriodEnd?: Date | string | null;
    cancelAtPeriodEnd?: boolean | null;
    canceledAt?: Date | string | null;
    metadata?: Record<string, unknown> | null;
    customer?: { externalId?: string | null } | null;
  };
};

function parseEpochMs(value: Date | string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

type ClerkUserData = {
  id?: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  deleted?: boolean;
};

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
      await UserService.markUserDeletedFromWebhook(db, clerkUserId);
    } else {
      await UserService.applyClerkUserUpsert(db, { clerkUserId, email: pickEmail(data) });
    }
    return { ok: true };
  },
  { parse: "none" },
).post(
  "/polar",
  async ({ request, headers }) => {
    const body = await request.text();
    // verifyWebhook melempar AppError (signature invalid→400 / secret missing→500),
    // di-map errorPlugin global. Header svix lower-case (cocok standardwebhooks).
    const headerRecord: Record<string, string> = {};
    for (const [k, v] of Object.entries(headers)) if (typeof v === "string") headerRecord[k] = v;
    const event = PolarClient.verifyWebhook(body, headerRecord) as PolarSubscriptionEvent;

    if (event.type !== "subscription.created" && event.type !== "subscription.updated") {
      return { ok: true, ignored: true };
    }

    const data = event.data;
    const ownerUserId = stringField(data.metadata?.userId) ?? stringField(data.customer?.externalId);
    if (!ownerUserId) {
      return status(400, {
        message: "Polar subscription event is missing metadata.userId",
        code: "billing_event_missing_owner",
        severity: "error",
      });
    }

    const currentPeriodEnd = parseEpochMs(data.currentPeriodEnd);
    const status_ = data.status ?? "unknown";
    const eventKey = `${event.type}:${data.id}:${currentPeriodEnd ?? ""}:${status_}`;
    const acquired = await setNxWithTtl(`polar:webhook:${eventKey}`, WEBHOOK_TTL_SECONDS);
    if (!acquired) {
      return { ok: true, deduped: true }; // event sama sudah diproses
    }

    const { db } = getDb();
    await BillingService.syncSubscriptionFromPolar(db, {
      ownerUserId,
      polarSubscriptionId: data.id,
      polarProductId: stringField(data.productId) ?? "",
      productKey: stringField(data.metadata?.productKey),
      status: status_,
      currentPeriodStart: parseEpochMs(data.currentPeriodStart),
      currentPeriodEnd,
      cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? undefined,
      canceledAt: parseEpochMs(data.canceledAt),
      rawJson: data,
    });
    return { ok: true, deduped: false };
  },
  { parse: "none" },
);
