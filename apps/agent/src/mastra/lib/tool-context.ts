import type { AgentKind } from "@aqsha/chat-core";
import {
  MASTRA_RESOURCE_ID_KEY,
  MASTRA_THREAD_ID_KEY,
  type RequestContext,
} from "@mastra/core/request-context";

/**
 * Helper kontekstual untuk tool Mastra Astra.
 *
 * - `callerId` = owner = `MASTRA_RESOURCE_ID_KEY` (diset Mastra dari `mapUserToResourceId`
 *   auth Clerk = `sub`, MENIMPA `resource` klien → tepercaya). WAJIB untuk akses data app.
 * - `callerEmail` = email caller (gate entitlement admin). Diisi oleh `userContextMiddleware`
 *   (`../middleware/user-context.ts`) dari klaim Clerk ke key `AQSHA_EMAIL_KEY` — SELALU diset
 *   (`""` bila token tak memuat email, dibaca sebagai `null` di sini) agar nilai injeksi klien
 *   tak pernah lolos merge body (lihat `AQSHA_SERVER_OWNED_CONTEXT_KEYS`). Tanpa email,
 *   admin-allowlist jatuh ke fallback email users-table di `resolveAdminOverride`.
 * - `threadScopeId` = thread aktif (scoping `research_sources` + RAG). Chat: dari
 *   `ctx.agent.threadId` (memory thread). Workflow `/deep`: step memanggil subagent via
 *   `agent.generate` tanpa memory thread → fallback ke `MASTRA_THREAD_ID_KEY` di RequestContext
 *   (di-set step dari `inputData.threadId`), supaya `research_sources` tetap menempel ke thread chat.
 * - `toolCallId` = id unik per pemanggilan tool → kunci idempotensi billing yang resume-safe
 *   (step durable re-run = id sama = tak double-debit).
 */
export const AQSHA_EMAIL_KEY = "aqsha__email";

/**
 * Run id deep-research aktif (di-set step Workflow lewat `withDeepRun`). Saat ada, tool riset
 * memakai INI sebagai `turnId` `research_sources` (bukan `toolCallId` per-pemanggilan) → semua
 * sumber satu run berbagi turn → dedupe + penomoran sitasi `[n]` global (G4).
 */
export const AQSHA_DEEP_RUN_KEY = "aqsha__deep_run_id";

/**
 * Turn chat aktif — di-set lazily oleh tool riset PERTAMA dalam satu turn (`chatTurnId`). Saat ada,
 * semua `research_sources` satu turn chat berbagi `turnId` → dedup + penomoran sitasi `[n]` GLOBAL
 * per-turn (sejajar `AQSHA_DEEP_RUN_KEY` di jalur `/deep`). Null sampai tool pertama memintanya.
 */
export const AQSHA_CHAT_TURN_KEY = "aqsha__chat_turn_id";

/**
 * Penghitung sitasi `[n]` berjalan untuk turn chat aktif. Hidup di RequestContext (per-request =
 * per-turn → tak bocor lintas-turn, tak perlu Map modul-level + cleanup). `reserveChatCitationOffset`
 * membaca-lalu-menaikkan SINKRON sehingga tiap pemanggilan tool (paralel sekalipun) menyabit rentang
 * nomornya sendiri → `[n]` yang dilihat & ditulis model unik lintas pencarian dalam satu turn.
 */
export const AQSHA_CHAT_CITE_COUNT_KEY = "aqsha__chat_cite_count";

/**
 * Sub-pertanyaan `/deep` aktif (index + teks) yang sedang dijawab `literatureSearcher`. Di-set
 * step `search-literature` pada RequestContext yang DI-CLONE per sub-pertanyaan (`Promise.all`),
 * supaya tool riset menstempel `research_sources.subQuestionIndex/Text` → FE mengelompokkan kartu
 * sumber per sub-agen pencarian. Null di jalur chat biasa & step deep lain.
 */
export const AQSHA_DEEP_SUBQ_INDEX_KEY = "aqsha__deep_subq_index";
export const AQSHA_DEEP_SUBQ_TEXT_KEY = "aqsha__deep_subq_text";

/**
 * Tier agen Astra (SoT billing + diferensiasi runtime: model, reasoning, maxSteps, memori). Definisi
 * tunggal di `@aqsha/chat-core`; di-re-export di sini supaya pemakai agent tetap mengimpor dari path
 * lib tool-context yang sudah ada.
 */
export type { AgentKind };

/**
 * Tier agen aktif `/deep`. Di-set step Workflow dari `inputData.agentKind` (lewat `withDeepRun`) ke
 * RequestContext yang DI-CLONE per sub-pertanyaan → subagent memilih `proModel` + penalaran via
 * `modelForRequestContext`. Chat biasa TAK memakainya: tier sudah inheren dari agent terpilih
 * (`astra-lite`/`astra-pro`), bukan dari RequestContext.
 */
export const AQSHA_AGENT_KIND_KEY = "aqsha__agent_kind";

/**
 * SEMUA key `aqsha__*` adalah server-owned (SEC-1). `mergeBodyRequestContext` (@mastra/server)
 * menyalin `requestContext` dari body klien ke RequestContext server untuk key yang BELUM
 * terdefinisi — hanya prefix `mastra__` yang di-reserve framework, jadi key `aqsha__*` bisa
 * di-inject klien (mis. `aqsha__email` → bypass allowlist admin billing). `userContextMiddleware`
 * pre-seed daftar ini SEBELUM handler me-merge body, sehingga nilai klien tak pernah masuk;
 * semua reader di file ini memperlakukan `""` sebagai absen. Key `aqsha__*` baru WAJIB
 * ditambahkan ke daftar ini.
 */
export const AQSHA_SERVER_OWNED_CONTEXT_KEYS = [
  AQSHA_EMAIL_KEY,
  AQSHA_DEEP_RUN_KEY,
  AQSHA_CHAT_TURN_KEY,
  AQSHA_CHAT_CITE_COUNT_KEY,
  AQSHA_DEEP_SUBQ_INDEX_KEY,
  AQSHA_DEEP_SUBQ_TEXT_KEY,
  AQSHA_AGENT_KIND_KEY,
] as const;

/** Tier agen dari RequestContext (default `"lite"` bila absen / nilai tak dikenal). */
export function agentKindFromRequestContext(rc: RequestContext | undefined): AgentKind {
  return rc?.get(AQSHA_AGENT_KIND_KEY) === "pro" ? "pro" : "lite";
}

export type AstraToolCtx = {
  requestContext?: RequestContext;
  agent?: { threadId?: string; resourceId?: string; toolCallId?: string };
};

export function callerId(ctx: AstraToolCtx): string {
  const raw = ctx.requestContext?.get(MASTRA_RESOURCE_ID_KEY);
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("Tool dipanggil tanpa resourceId terautentikasi.");
  }
  return raw;
}

export function callerEmail(ctx: AstraToolCtx): string | null {
  const raw = ctx.requestContext?.get(AQSHA_EMAIL_KEY);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Owner (id + email) dari RequestContext mentah — varian lunak untuk processor (billing) yang
 * bekerja tanpa `AstraToolCtx` dan harus return-early (bukan throw) saat owner tak ada.
 */
export function ownerFromRequestContext(rc: RequestContext | undefined): {
  id: string | null;
  email: string | null;
} {
  const id = rc?.get(MASTRA_RESOURCE_ID_KEY);
  const email = rc?.get(AQSHA_EMAIL_KEY);
  return {
    id: typeof id === "string" && id ? id : null,
    email: typeof email === "string" && email ? email : null,
  };
}

export function threadScopeId(ctx: AstraToolCtx): string {
  const fromAgent = ctx.agent?.threadId;
  if (fromAgent) return fromAgent;
  // Jalur workflow `/deep`: tak ada memory thread; step menaruh threadId di RequestContext.
  const fromRequest = ctx.requestContext?.get(MASTRA_THREAD_ID_KEY);
  if (typeof fromRequest === "string" && fromRequest.length > 0) return fromRequest;
  throw new Error("Tool butuh thread aktif (memory thread) untuk scoping data.");
}

export function toolCallId(ctx: AstraToolCtx): string {
  return ctx.agent?.toolCallId ?? "no-tool-call-id";
}

/** Run id deep-research aktif dari RequestContext (`null` di jalur chat biasa). */
export function deepRunId(ctx: AstraToolCtx): string | null {
  const raw = ctx.requestContext?.get(AQSHA_DEEP_RUN_KEY);
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * Id turn chat aktif (get-or-create di RequestContext) — dipakai sebagai `research_sources.turnId`
 * di jalur chat biasa supaya semua sumber satu turn berbagi turn (dedup + sitasi `[n]` global
 * per-turn), sejajar `deepRunId` di jalur `/deep`. Fallback ke `toolCallId` bila RequestContext absen.
 */
export function chatTurnId(ctx: AstraToolCtx): string {
  const rc = ctx.requestContext;
  if (!rc) return toolCallId(ctx);
  const existing = rc.get(AQSHA_CHAT_TURN_KEY);
  if (typeof existing === "string" && existing) return existing;
  const id = crypto.randomUUID();
  rc.set(AQSHA_CHAT_TURN_KEY, id);
  return id;
}

/**
 * Sabit `count` nomor sitasi berikutnya untuk turn chat aktif → kembalikan OFFSET awal (basis 0).
 * Baca-lalu-naikkan SINKRON (tanpa await di antaranya) supaya aman terhadap tool-call paralel dalam
 * satu turn: tiap pemanggilan menyabit rentangnya sendiri → `[n]` unik lintas pencarian. Offset 0
 * bila RequestContext absen (jalur degradasi).
 */
export function reserveChatCitationOffset(ctx: AstraToolCtx, count: number): number {
  const rc = ctx.requestContext;
  if (!rc) return 0;
  // Counter ini hanya ditulis di sini sebagai number → tak perlu jalur koersi string.
  const raw = rc.get(AQSHA_CHAT_CITE_COUNT_KEY);
  const cur = typeof raw === "number" ? raw : 0;
  rc.set(AQSHA_CHAT_CITE_COUNT_KEY, cur + count);
  return cur;
}

/**
 * Sub-pertanyaan `/deep` aktif (index + teks) dari RequestContext (`null` di jalur chat biasa).
 * Dipakai `persistResearch` untuk men-tag `research_sources` per sub-agen pencarian.
 */
export function deepSubQuestion(ctx: AstraToolCtx): { index: number; text: string } | null {
  const rawIndex = ctx.requestContext?.get(AQSHA_DEEP_SUBQ_INDEX_KEY);
  const index =
    typeof rawIndex === "number"
      ? rawIndex
      : typeof rawIndex === "string" && rawIndex
        ? Number(rawIndex)
        : Number.NaN;
  if (!Number.isInteger(index) || index < 0) return null;
  const rawText = ctx.requestContext?.get(AQSHA_DEEP_SUBQ_TEXT_KEY);
  return { index, text: typeof rawText === "string" ? rawText : "" };
}
