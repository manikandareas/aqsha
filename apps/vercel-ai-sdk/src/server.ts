import { timingSafeEqual } from "node:crypto";
import { env, resolveAppPath } from "./config";
import type { AstraDeps } from "./deps";
import { resolveModel } from "./model";
import { discoverSkills } from "./skills";
import { createAstraAgentResponse } from "./streams";
import type { InternalChatRequest } from "./types";

const skillsRegistryPromise = discoverSkills(
  env.ASTRA_SKILLS_ROOTS.split(",").map((root) => resolveAppPath(root.trim())).filter(Boolean),
);

export function createServer(): Bun.Server<undefined> {
  return Bun.serve({
    hostname: env.VERCEL_AI_SDK_HOST,
    port: env.VERCEL_AI_SDK_PORT,
    fetch: handleRequest,
  });
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return Response.json({ ok: true, service: "@aqsha/vercel-ai-sdk" });
  }

  if (request.method === "POST" && url.pathname === "/internal/chat") {
    return handleInternalChat(request);
  }

  return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
}

async function handleInternalChat(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID().replaceAll("-", "");
  const authResponse = requireInternalAuth(request.headers.get("authorization"), requestId);
  if (authResponse) {
    return authResponse;
  }

  let body: InternalChatRequest;
  try {
    body = (await request.json()) as InternalChatRequest;
  } catch {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.", requestId);
  }

  if (!Array.isArray(body.messages)) {
    return jsonError(400, "invalid_messages", "Request body must include messages array.", requestId);
  }

  try {
    const deps: AstraDeps = {
      userId: headerValue(request, "x-astra-user-id") ?? env.ASTRA_USER_ID,
      workspace: headerValue(request, "x-astra-workspace") ?? env.ASTRA_WORKSPACE,
      conversationId: body.id,
      researchArtifactDir: resolveAppPath(env.ASTRA_RESEARCH_ARTIFACT_DIR),
      constraints: [],
    };
    const resolvedModel = resolveModel(request.headers.get("x-astra-model"));
    const skills = await skillsRegistryPromise;

    return await createAstraAgentResponse({
      model: resolvedModel.model,
      providerOptions: resolvedModel.providerOptions,
      context: {
        deps,
        skills,
        skillScriptsEnabled: env.ASTRA_ENABLE_SKILL_SCRIPTS,
        skillScriptTimeoutMs: env.ASTRA_SKILL_SCRIPT_TIMEOUT_MS,
      },
      uiMessages: body.messages,
      abortSignal: request.signal,
      headers: {
        "x-astra-request-id": requestId,
      },
    });
  } catch (error) {
    return jsonError(
      500,
      "agents_service_error",
      error instanceof Error ? error.message : "Agents service failed.",
      requestId,
    );
  }
}

function requireInternalAuth(authorization: string | null, requestId: string): Response | null {
  if (!env.ASTRA_INTERNAL_TOKEN) {
    return jsonError(500, "missing_internal_token", "ASTRA_INTERNAL_TOKEN is required.", requestId);
  }

  const expected = `Bearer ${env.ASTRA_INTERNAL_TOKEN}`;
  if (!authorization || !safeEqual(authorization, expected)) {
    return jsonError(401, "unauthorized", "Unauthorized", requestId);
  }

  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.byteLength !== rightBuffer.byteLength) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function headerValue(request: Request, name: string): string | undefined {
  const value = request.headers.get(name)?.trim();
  return value || undefined;
}

function jsonError(status: number, code: string, message: string, requestId: string): Response {
  return Response.json(
    {
      error: { code, message, requestId },
    },
    {
      status,
      headers: {
        "x-astra-request-id": requestId,
      },
    },
  );
}
