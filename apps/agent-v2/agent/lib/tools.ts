import { BillingService } from "@aqsha/services/billing";
import { ResearchService } from "@aqsha/services/research";
import type { ResearchCandidate } from "@aqsha/services/research";
import type { ToolContext } from "eve/tools";
import { getServiceDb } from "./db.ts";

/**
 * Helper bersama untuk eve tools Astra (Slice 6.4). DILETAKKAN di `agent/lib/`,
 * BUKAN `agent/tools/`: setiap file di `agent/tools/` di-daftarkan sebagai tool
 * dengan nama = slug file, jadi helper tak boleh tinggal di sana.
 *
 * Semua tool memakai `@aqsha/db`/`@aqsha/services` dist via `externalDependencies`
 * GLOBAL di `agent/agent.ts` (keputusan D-E) — tak ada raw-SQL baru.
 */

/** Owner = principal pemanggil turn (di belakang ownership gate channel 6.1). */
export function callerId(ctx: ToolContext): string {
  const principalId =
    ctx.session.auth.current?.principalId ?? ctx.session.auth.initiator?.principalId;
  if (!principalId) {
    // Tak seharusnya terjadi: channel `auth: [clerkAuth()]` menolak request tanpa
    // principal sebelum turn jalan. Defensif: gagalkan tool, bukan jalan tanpa owner.
    throw new Error("Tool dipanggil tanpa principal terautentikasi.");
  }
  return principalId;
}

/** Email caller (untuk gate entitlement admin), bila ada di attributes Clerk. */
export function callerEmail(ctx: ToolContext): string | null {
  const email = ctx.session.auth.current?.attributes?.email;
  return typeof email === "string" ? email : null;
}

export { getServiceDb };

/**
 * Gerbang + debit `external_search` (flat 2 kredit) untuk satu pemanggilan tool
 * riset. IDEMPOTEN saat resume eve: `idempotencyKey` stabil per (thread,turn,tool,
 * suffix) → step yang RE-RUN tak double-debit (A9). Return `false` bila kuota
 * habis → tool melapor ke model tanpa melakukan pencarian.
 */
export async function chargeExternalSearch(
  ctx: ToolContext,
  args: { ownerUserId: string; tool: string; provider: string; idemSuffix: string },
): Promise<boolean> {
  const result = await BillingService.consumeCredits(getServiceDb(), {
    ownerUserId: args.ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: "external_search",
    provider: args.provider,
    threadId: ctx.session.id,
    idempotencyKey: `${ctx.session.id}:${ctx.session.turn.id}:${args.tool}:${args.idemSuffix}`,
  });
  return result.ok;
}

/**
 * Persist kandidat sumber riset (best-effort) — kegagalan persist tak boleh
 * meracuni hasil tool yang ditunggu model. Key thread+turn (idempoten di repo).
 */
export async function persistResearch(
  ctx: ToolContext,
  args: { ownerUserId: string; candidates: ResearchCandidate[]; discoveryQuery?: string },
): Promise<void> {
  try {
    await ResearchService.persistSources(getServiceDb(), {
      threadId: ctx.session.id,
      ownerUserId: args.ownerUserId,
      turnId: ctx.session.turn.id,
      discoveryQuery: args.discoveryQuery,
      candidates: args.candidates,
      now: Date.now(),
    });
  } catch (err) {
    console.error("[tools] persistResearch failed", err);
  }
}

/** Bentuk hasil tool riset yang dilihat model — bernomor + ringkas untuk sitasi [n]. */
export function toResearchToolOutput(candidates: ResearchCandidate[]): {
  results: Array<{
    n: number;
    title: string;
    url?: string;
    doi?: string;
    arxivId?: string;
    origin: string;
    snippet: string;
  }>;
} {
  return {
    results: candidates.map((c, i) => ({
      n: i + 1,
      title: c.title,
      url: c.url,
      doi: c.doi,
      arxivId: c.arxivId,
      origin: c.origin,
      snippet: c.snippet,
    })),
  };
}
