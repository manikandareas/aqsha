import { httpRouter } from "convex/server";
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { Webhook, WebhookVerificationError } from "standardwebhooks";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { polar } from "./billing/polar";

const http = httpRouter();

http.route({
  path: "/clerk/webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
    if (!signingSecret) {
      return json({ error: "CLERK_WEBHOOK_SIGNING_SECRET is not configured." }, 500);
    }

    const payload = await request.text();
    let event: ClerkWebhookEvent;
    try {
      event = new Webhook(signingSecret).verify(payload, svixHeaders(request)) as ClerkWebhookEvent;
    } catch (error) {
      if (error instanceof WebhookVerificationError) {
        return json({ error: "Invalid Clerk webhook signature." }, 400);
      }
      throw error;
    }

    const normalized = normalizeClerkUserWebhook(event);
    if (!normalized) {
      return json({ ok: true, ignored: true });
    }

    await ctx.runMutation(internal.auth.processClerkWebhook, normalized);
    return json({ ok: true });
  }),
});

polar.registerRoutes(http, {
  path: "/polar/events",
  events: {
    "subscription.created": async (
      ctx: { runMutation: GenericMutationCtx<GenericDataModel>["runMutation"] },
      event: { data: SubscriptionEventData },
    ) => {
      await ctx.runMutation(internal.billing.entitlements.syncSubscriptionFromPolar, {
        ...subscriptionEventPayload("subscription.created", event.data),
      });
    },
    "subscription.updated": async (
      ctx: { runMutation: GenericMutationCtx<GenericDataModel>["runMutation"] },
      event: { data: SubscriptionEventData },
    ) => {
      await ctx.runMutation(internal.billing.entitlements.syncSubscriptionFromPolar, {
        ...subscriptionEventPayload("subscription.updated", event.data),
      });
    },
  },
});

export default http;

type ClerkWebhookEvent = {
  id?: string;
  type: string;
  data: ClerkUserWebhookData;
};

type ClerkUserWebhookData = {
  id?: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
  deleted?: boolean;
};

function normalizeClerkUserWebhook(event: ClerkWebhookEvent) {
  if (!event.type.startsWith("user.")) {
    return null;
  }

  const clerkUserId = event.data.id;
  if (!clerkUserId) {
    throw new Error("Clerk webhook payload is missing user id.");
  }

  return {
    eventId: event.id ?? `${event.type}:${clerkUserId}`,
    eventType: event.type,
    clerkUserId,
    email: primaryEmail(event.data),
    name: displayName(event.data),
    image: event.data.image_url ?? null,
    deleted: event.type === "user.deleted" || event.data.deleted === true,
  };
}

function svixHeaders(request: Request) {
  return {
    "webhook-id": request.headers.get("svix-id") ?? "",
    "webhook-timestamp": request.headers.get("svix-timestamp") ?? "",
    "webhook-signature": request.headers.get("svix-signature") ?? "",
  };
}

function primaryEmail(data: ClerkUserWebhookData) {
  return (
    data.email_addresses?.find((email) => email.id === data.primary_email_address_id)
      ?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    null
  );
}

function displayName(data: ClerkUserWebhookData) {
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type SubscriptionEventData = {
  id: string;
  productId: string;
  status: string;
  currentPeriodStart: Date | string;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | string | null;
  metadata?: Record<string, unknown>;
};

function subscriptionEventPayload(eventType: string, data: SubscriptionEventData) {
  const ownerUserId = stringMetadata(data.metadata, "userId");
  if (!ownerUserId) {
    throw new Error("Polar subscription event is missing metadata.userId");
  }
  return {
    eventKey: `${eventType}:${data.id}:${String(data.currentPeriodEnd ?? "")}:${data.status}`,
    eventType,
    ownerUserId,
    polarSubscriptionId: data.id,
    polarProductId: data.productId,
    productKey: stringMetadata(data.metadata, "productKey"),
    status: data.status,
    currentPeriodStart: timeValue(data.currentPeriodStart),
    currentPeriodEnd: timeValue(data.currentPeriodEnd),
    cancelAtPeriodEnd: data.cancelAtPeriodEnd,
    canceledAt: timeValue(data.canceledAt),
    rawJson: JSON.stringify(data),
  };
}

function stringMetadata(metadata: Record<string, unknown> | undefined, key: string) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function timeValue(value: Date | string | null | undefined) {
  if (!value) {
    return undefined;
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}
