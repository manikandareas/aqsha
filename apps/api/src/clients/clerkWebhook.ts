import { AppError } from "@aqsha/db";
import { verifyWebhook } from "@clerk/backend/webhooks";
import type { WebhookEvent } from "@clerk/backend/webhooks";

/**
 * Verifikasi signature webhook Clerk (Standard Webhooks/svix) langsung dari
 * `Request` mentah — `verifyWebhook` membaca raw body sendiri (route memakai
 * `parse: "none"` supaya Elysia tak meng-consume body). Melempar AppError bila
 * secret belum dikonfigurasi (→ 500); melempar error verifikasi bila signature
 * salah (route map → 400).
 */
export async function verifyClerkWebhook(request: Request): Promise<WebhookEvent> {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret) {
    throw new AppError({
      code: "clerk_webhook_secret_missing",
      message: "CLERK_WEBHOOK_SIGNING_SECRET is not configured.",
      severity: "error",
      status: 500,
    });
  }
  return verifyWebhook(request, { signingSecret });
}
