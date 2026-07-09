import { AppError } from "@aqsha/db";
import { BillingService } from "@aqsha/services/billing";
import type { EntitlementResult } from "@aqsha/services/billing";
import { getServiceDb } from "./db";
import { type AstraToolCtx, callerEmail, callerId, threadScopeId, toolCallId } from "./tool-context";

/**
 * Helper billing + error-mapping tool analisis statistik (sandbox_compute).
 * Pola sama dengan `lib/research.ts`: gate NON-consuming SEBELUM eksekusi sandbox,
 * debit hanya SETELAH analisis sukses (idempotencyKey per-toolCall → retry/resume
 * tak double-debit). Blocked = return value rapi, bukan throw.
 */

export function analysisBlockedNote(gate: Extract<EntitlementResult, { ok: false }>): string {
  if (gate.reason === "quota_exceeded") {
    return "Kredit analisis bulan ini sudah habis. Kuota di-reset awal periode berikutnya — atau upgrade plan untuk kuota lebih besar.";
  }
  if (gate.reason === "subscription_required") {
    return "Fitur ini butuh plan berbayar. Ajak user melihat halaman harga bila tertarik.";
  }
  return "Status billing akun sedang tidak aktif; analisis tidak bisa dijalankan sekarang.";
}

export async function precheckSandboxCompute(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; credits: number },
): Promise<EntitlementResult> {
  return BillingService.requireEntitlement(getServiceDb(), {
    ownerUserId: args.ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: "sandbox_compute",
    credits: args.credits,
  });
}

export async function chargeSandboxCompute(
  ctx: AstraToolCtx,
  args: { ownerUserId: string; credits: number; tool: string },
): Promise<boolean> {
  const result = await BillingService.consumeCredits(getServiceDb(), {
    ownerUserId: args.ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: "sandbox_compute",
    provider: "daytona",
    credits: args.credits,
    threadId: threadScopeId(ctx),
    idempotencyKey: `${threadScopeId(ctx)}:${toolCallId(ctx)}:${args.tool}`,
  });
  return result.ok;
}

/** Error infra/sandbox → note ramah untuk model (bukan stack trace). */
export function analysisFailureNote(error: unknown): string {
  if (error instanceof AppError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("DAYTONA_API_KEY") || message.includes("AQSHA_DAYTONA_SNAPSHOT")) {
    return "Fitur analisis data belum dikonfigurasi di server ini (sandbox statistik nonaktif). Sampaikan ke user bahwa fitur sedang tidak tersedia.";
  }
  return `Sandbox analisis gagal: ${message}. Coba ulangi sekali; bila tetap gagal, sampaikan kendala ke user.`;
}

export function analysisScope(ctx: AstraToolCtx): { ownerUserId: string; threadId: string } {
  return { ownerUserId: callerId(ctx), threadId: threadScopeId(ctx) };
}
