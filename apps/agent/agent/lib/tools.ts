import { BillingService } from "@aqsha/services/billing";
import type { CreditFeature } from "@aqsha/services/plan";
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
 * Thread id untuk scoping data per-percakapan (research_sources + RAG). Saat tool
 * dipanggil DI DALAM subagent terdeklarasi, `ctx.session.id` = CHILD session, bukan
 * thread user-facing (FLAG-2 §0). eve mendenormalisasi puncak rantai dispatch di
 * `ctx.session.parent.rootSessionId` → pakai itu bila ada agar sumber subagent masuk
 * panel Sources thread induk + RAG melihat lampiran induk. Di root, `parent` undefined.
 */
export function threadScopeId(ctx: ToolContext): string {
  return ctx.session.parent?.rootSessionId ?? ctx.session.id;
}

/**
 * Gerbang + debit kredit untuk satu pemanggilan tool yang merekam usage. IDEMPOTEN
 * saat resume eve: `idempotencyKey` stabil per (session,turn,tool,suffix) → step yang
 * RE-RUN tak double-debit (A9). Return `false` bila kuota habis → tool melapor ke model
 * tanpa menjalankan operasi. `feature` menentukan rate (mis. `external_search`=2 kredit,
 * `citation_verify`=0 → usage-tracked, selalu ok). Idempotency tetap pakai child session
 * id di dalam subagent — billing owner benar (callerId), key unik per child.
 */
export async function chargeToolUsage(
  ctx: ToolContext,
  args: {
    ownerUserId: string;
    feature: CreditFeature;
    tool: string;
    provider: string;
    idemSuffix: string;
  },
): Promise<boolean> {
  const result = await BillingService.consumeCredits(getServiceDb(), {
    ownerUserId: args.ownerUserId,
    ownerEmail: callerEmail(ctx),
    feature: args.feature,
    provider: args.provider,
    threadId: threadScopeId(ctx),
    idempotencyKey: `${ctx.session.id}:${ctx.session.turn.id}:${args.tool}:${args.idemSuffix}`,
  });
  return result.ok;
}

/** Wrapper tipis: debit `external_search` (2 kredit) untuk tool riset (search_*). */
export function chargeExternalSearch(
  ctx: ToolContext,
  args: { ownerUserId: string; tool: string; provider: string; idemSuffix: string },
): Promise<boolean> {
  return chargeToolUsage(ctx, { ...args, feature: "external_search" });
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
      threadId: threadScopeId(ctx),
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
