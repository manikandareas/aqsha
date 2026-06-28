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
 *   (`../middleware/user-context.ts`) dari klaim Clerk ke key `AQSHA_EMAIL_KEY`; `null` bila
 *   token tak memuat email (admin-allowlist tak aktif untuk user itu, sama seperti eve).
 * - `threadScopeId` = thread aktif (scoping `research_sources` + RAG). Chat: dari
 *   `ctx.agent.threadId` (memory thread). Workflow `/deep`: step memanggil subagent via
 *   `agent.generate` tanpa memory thread → fallback ke `MASTRA_THREAD_ID_KEY` di RequestContext
 *   (di-set step dari `inputData.threadId`), supaya `research_sources` tetap menempel ke thread chat.
 * - `toolCallId` = id unik per pemanggilan tool → kunci idempotensi billing yang resume-safe
 *   (step durable re-run = id sama = tak double-debit).
 */
export const AQSHA_EMAIL_KEY = "aqsha__email";

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
