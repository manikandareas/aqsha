import { tool } from "ai";
import { z } from "zod";
import type { CachedSource, MemoryScope } from "../../modules/memory/model";
import type { MemoryService } from "../../modules/memory/service";
import type { ReaderAgent } from "../subagents";

type ReaderToolDeps = {
  agent: ReaderAgent;
  memoryService?: MemoryService;
  scope?: MemoryScope;
};

export function createResearchReaderTool(deps: ReaderToolDeps) {
  return tool({
    description:
      "Fetch the listed URLs and extract structured evidence cards (claims, quotes, numbers, source tier). Call this after research_searcher to deeply read the most promising candidates.",
    inputSchema: z.object({
      urls: z
        .array(z.string().min(1))
        .min(1)
        .max(4)
        .describe("Up to 4 URLs to fetch. Keep batches small to avoid context-window limits."),
      subQuestionContext: z
        .string()
        .min(1)
        .describe("The sub-question text these URLs should address."),
    }),
    execute: async ({ urls, subQuestionContext }, { abortSignal }) => {
      const cached = await lookupCache(deps, urls);
      const cachedUrls = new Set(cached.keys());
      const remaining = urls.filter((url) => !cachedUrls.has(url));

      const prompt = buildPrompt({
        subQuestionContext,
        cached: Array.from(cached.values()),
        remainingUrls: remaining,
      });

      const result = await deps.agent.generate({
        prompt,
        abortSignal,
      });

      if (deps.memoryService && deps.scope) {
        const settled = await Promise.allSettled([
          deps.memoryService.persistFetchedBodies(result.steps, deps.scope),
          deps.memoryService.storeEvidenceCards({
            cards: result.output,
            scope: deps.scope,
          }),
        ]);
        for (const entry of settled) {
          if (entry.status === "rejected") {
            logMemoryWriteError(entry.reason);
          }
        }
      }

      return result.output;
    },
  });
}

async function lookupCache(
  deps: ReaderToolDeps,
  urls: string[],
): Promise<Map<string, CachedSource>> {
  if (!deps.memoryService || !deps.scope) {
    return new Map<string, CachedSource>();
  }
  try {
    return await deps.memoryService.lookupCachedSources(urls, {
      ownerUserId: deps.scope.ownerUserId,
    });
  } catch (error) {
    logMemoryWriteError(error, "memory cache lookup failed");
    return new Map<string, CachedSource>();
  }
}

function buildPrompt({
  subQuestionContext,
  cached,
  remainingUrls,
}: {
  subQuestionContext: string;
  cached: CachedSource[];
  remainingUrls: string[];
}): string {
  const lines: string[] = [`Sub-question context: ${subQuestionContext}`];

  if (cached.length > 0) {
    lines.push(
      "",
      "PRE-FETCHED CONTENT (already cached, do NOT call any fetch tool for these URLs — treat the inlined text as if it came from web_fetch_exa):",
    );
    for (const entry of cached) {
      lines.push(
        `- url: ${entry.url}`,
        `  title: ${entry.title ?? "(unknown)"}`,
        `  fetchedAt: ${entry.fetchedAt}`,
        `  text: |`,
        ...entry.text.split("\n").map((line) => `    ${line}`),
      );
    }
  }

  if (remainingUrls.length > 0) {
    lines.push(
      "",
      "URLs still requiring fetch:",
      ...remainingUrls.map((url) => `- ${url}`),
      "",
      "Use web_fetch_exa for each URL above. Apply the fallback chain (fetch_url, pdf_extract) if web_fetch_exa fails. Extract evidence cards per the schema. Skip URLs that fail to fetch or are irrelevant.",
    );
  } else if (cached.length > 0) {
    lines.push(
      "",
      "All URLs were served from cache — extract evidence cards directly from the PRE-FETCHED CONTENT above. Do not call any fetch tool.",
    );
  }

  return lines.join("\n");
}

function logMemoryWriteError(reason: unknown, message = "memory write failed") {
  const payload: Record<string, unknown> = {
    level: "error",
    module: "memory",
    message,
  };
  if (reason instanceof Error) {
    payload.errorName = reason.name;
    payload.errorMessage = reason.message;
    payload.stack = reason.stack;
  } else if (reason !== undefined) {
    payload.error = reason;
  }
  console.error(JSON.stringify(payload));
}
