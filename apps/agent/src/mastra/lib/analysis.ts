import { buildStatsGroup, statsMarker, toRunKey } from "@aqsha/chat-core/stats-viz";
import { AppError } from "@aqsha/db";
import { AnalysisService } from "@aqsha/services/analysis";
import type { AnalysisChart } from "@aqsha/services/analysis";
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

/**
 * Persist grup blok hasil analisis (tabel/verdict/figur) di luar teks pesan → FE me-join
 * per-thread untuk merender penanda `{{stats:<runKey>}}`. `threadId` diambil dari ctx supaya
 * blok terikat thread yang benar. Best-effort dari sisi tool: kegagalan persist di-log tapi
 * hasil tetap dikembalikan ke model (narasi tetap benar, hanya tabel/figur yang tak muncul).
 */
export async function persistStatsBlocks(
  ctx: AstraToolCtx,
  args: {
    ownerUserId: string;
    toolCallId: string;
    runKey: string;
    analysis: string;
    title: string;
    blocks: unknown[];
    custom?: boolean;
    code?: string;
  },
): Promise<void> {
  try {
    await AnalysisService.saveResultBlocks(getServiceDb(), {
      ownerUserId: args.ownerUserId,
      threadId: threadScopeId(ctx),
      toolCallId: args.toolCallId,
      runKey: args.runKey,
      analysis: args.analysis,
      title: args.title,
      blocks: args.blocks,
      custom: args.custom,
      code: args.code,
    });
  } catch (err) {
    console.error("[tools] persistStatsBlocks gagal", err);
  }
}

/**
 * Pasca-sukses analisis (katalog & codegen): bangun grup blok (tabel SPSS + kartu verdict + figur
 * PNG), persist di luar teks pesan (FE me-join per-thread lewat penanda `{{stats:<runKey>}}`), lalu
 * kembalikan `marker` untuk disisipkan model. `runKey` diturunkan dari `toolCallId` → idempoten
 * (re-run tool = runKey sama = upsert, bukan gandakan). Return `marker` undefined bila grup kosong
 * (tak ada tabel/figur) supaya caller tak menyuruh model menaruh penanda hampa.
 */
export async function finalizeStatsRun(
  ctx: AstraToolCtx,
  args: {
    ownerUserId: string;
    analysis: string;
    title: string;
    result: Record<string, unknown>;
    charts: AnalysisChart[];
    custom?: boolean;
    code?: string;
  },
): Promise<{ marker?: string }> {
  const callId = toolCallId(ctx);
  const runKey = toRunKey(callId);
  const group = buildStatsGroup({
    runKey,
    analysis: args.analysis,
    title: args.title,
    result: args.result as Parameters<typeof buildStatsGroup>[0]["result"],
    charts: args.charts,
    ...(args.custom ? { custom: true, code: args.code } : {}),
  });
  if (!group) return {};
  await persistStatsBlocks(ctx, {
    ownerUserId: args.ownerUserId,
    toolCallId: callId,
    runKey,
    analysis: args.analysis,
    title: args.title,
    blocks: group.blocks,
    custom: args.custom,
    code: args.code,
  });
  return { marker: statsMarker(runKey) };
}
