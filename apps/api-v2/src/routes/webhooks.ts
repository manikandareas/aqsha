import { AppError } from "@aqsha/db";
import { UserService } from "@aqsha/services";
import { Elysia, status } from "elysia";
import { verifyClerkWebhook } from "../clients/clerkWebhook";
import { getDb } from "../clients/db";
import { setNxWithTtl } from "../clients/redis";

const WEBHOOK_TTL_SECONDS = 60 * 60 * 24; // 24 jam ≥ jendela retry svix

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
);
