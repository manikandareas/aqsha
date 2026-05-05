import { tool } from "ai";
import { z } from "zod";

const DEFAULT_TIMEOUT_MS = 8_000;

export function createVerifyUrlLiveTool() {
  return tool({
    description:
      "HEAD-check a URL to confirm it is reachable. Returns ok=true for 2xx/3xx; ok=false for 4xx/5xx, network errors, or timeout. Use to detect dead_link issues in bibliography URLs before concluding the draft is faithful.",
    inputSchema: z.object({
      url: z.string().min(1),
    }),
    execute: async ({ url }) => {
      const startedAt = new Date().toISOString();

      const target = (() => {
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
            return null;
          }
          return parsed.toString();
        } catch {
          return null;
        }
      })();

      if (!target) {
        return {
          ok: false,
          status: "invalid_url" as const,
          lastChecked: startedAt,
          finalUrl: null,
        };
      }

      const headResult = await attemptFetch(target, "HEAD");
      if (headResult.kind === "response" && headResult.status === 405) {
        return formatRangeFallback(await attemptFetch(target, "RANGE"), startedAt);
      }
      return formatResult(headResult, startedAt);
    },
  });
}

type AttemptResult =
  | { kind: "response"; status: number; finalUrl: string }
  | { kind: "timeout" }
  | { kind: "error"; reason: string };

async function attemptFetch(
  url: string,
  method: "HEAD" | "RANGE",
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const init: RequestInit =
      method === "HEAD"
        ? { method: "HEAD", redirect: "follow", signal: controller.signal }
        : {
            method: "GET",
            redirect: "follow",
            signal: controller.signal,
            headers: { Range: "bytes=0-0" },
          };

    const response = await fetch(url, init);
    return {
      kind: "response",
      status: response.status,
      finalUrl: response.url,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { kind: "timeout" };
    }
    return {
      kind: "error",
      reason: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function formatResult(result: AttemptResult, startedAt: string) {
  if (result.kind === "response") {
    return {
      ok: result.status >= 200 && result.status < 400,
      status: result.status,
      lastChecked: startedAt,
      finalUrl: result.finalUrl,
    };
  }
  if (result.kind === "timeout") {
    return {
      ok: false,
      status: "timeout" as const,
      lastChecked: startedAt,
      finalUrl: null,
    };
  }
  return {
    ok: false,
    status: "error" as const,
    reason: result.reason,
    lastChecked: startedAt,
    finalUrl: null,
  };
}

function formatRangeFallback(result: AttemptResult, startedAt: string) {
  return formatResult(result, startedAt);
}
