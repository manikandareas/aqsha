import { httpRouter } from "convex/server";
import type { GenericDataModel, GenericMutationCtx } from "convex/server";
import { internal } from "./_generated/api";
import { authComponent, createAuth } from "./auth";
import { polar } from "./billing/polar";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth);
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
