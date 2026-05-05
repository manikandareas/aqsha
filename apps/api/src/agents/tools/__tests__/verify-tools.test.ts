import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import type { MemoryService } from "../../../modules/memory/service";
import { createVerifyCitationExistsTool } from "../verify-citation-exists";
import { createVerifyQuoteInSourceTool } from "../verify-quote-in-source";
import { createVerifyUrlLiveTool } from "../verify-url-live";

type ToolWithExecute = {
  execute: (
    input: Record<string, unknown>,
    ctx: { toolCallId: string; messages: never[] },
  ) => Promise<unknown>;
};

const ctx = { toolCallId: "test-call-id", messages: [] as never[] };

function asExecutable<T extends { execute?: unknown }>(value: T): ToolWithExecute {
  return value as unknown as ToolWithExecute;
}

describe("verify_citation_exists", () => {
  it("returns exists=true and matchedClaim=true when card matches both URL and claim text", async () => {
    const memoryService = {
      findEvidenceCardsByUrl: async () => [
        {
          cardId: "card-1",
          claimText: "RAG retrieval requires hybrid search",
          quote: null,
        },
      ],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyCitationExistsTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      {
        sourceUrl: "https://example.com/paper",
        claimText: "RAG retrieval requires hybrid search",
      },
      ctx,
    )) as { exists: boolean; matchedClaim: boolean; cardIds: string[]; count: number };

    expect(result.exists).toBe(true);
    expect(result.matchedClaim).toBe(true);
    expect(result.cardIds).toEqual(["card-1"]);
    expect(result.count).toBe(1);
  });

  it("returns matchedClaim=false when claimText differs from stored card", async () => {
    const memoryService = {
      findEvidenceCardsByUrl: async () => [
        { cardId: "card-1", claimText: "The cat is on the mat", quote: null },
      ],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyCitationExistsTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/paper", claimText: "Different claim" },
      ctx,
    )) as { exists: boolean; matchedClaim: boolean };

    expect(result.exists).toBe(true);
    expect(result.matchedClaim).toBe(false);
  });

  it("returns exists=false when no card matches the URL", async () => {
    const memoryService = {
      findEvidenceCardsByUrl: async () => [],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyCitationExistsTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/missing" },
      ctx,
    )) as { exists: boolean; cardIds: string[]; count: number };

    expect(result.exists).toBe(false);
    expect(result.cardIds).toEqual([]);
    expect(result.count).toBe(0);
  });
});

describe("verify_url_live", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns ok=true when HEAD returns 200", async () => {
    globalThis.fetch = mock(async (_url: string, _init?: RequestInit) =>
      new Response(null, { status: 200 }),
    ) as unknown as typeof fetch;

    const tool = asExecutable(createVerifyUrlLiveTool());
    const result = (await tool.execute(
      { url: "https://example.com/page" },
      ctx,
    )) as { ok: boolean; status: number };

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("returns ok=false when HEAD returns 404", async () => {
    globalThis.fetch = mock(async () =>
      new Response(null, { status: 404 }),
    ) as unknown as typeof fetch;

    const tool = asExecutable(createVerifyUrlLiveTool());
    const result = (await tool.execute(
      { url: "https://example.com/missing" },
      ctx,
    )) as { ok: boolean; status: number };

    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
  });

  it("returns invalid_url status for non-http(s) schemes", async () => {
    const tool = asExecutable(createVerifyUrlLiveTool());
    const result = (await tool.execute(
      { url: "ftp://example.com/" },
      ctx,
    )) as { ok: boolean; status: string };

    expect(result.ok).toBe(false);
    expect(result.status).toBe("invalid_url");
  });

  it("falls back to ranged GET when HEAD returns 405", async () => {
    let calls = 0;
    globalThis.fetch = mock(async (_url: string, init?: RequestInit) => {
      calls += 1;
      if (init?.method === "HEAD") return new Response(null, { status: 405 });
      return new Response("body", { status: 206 });
    }) as unknown as typeof fetch;

    const tool = asExecutable(createVerifyUrlLiveTool());
    const result = (await tool.execute(
      { url: "https://example.com/" },
      ctx,
    )) as { ok: boolean; status: number };

    expect(calls).toBe(2);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(206);
  });

  it("returns status=error when fetch rejects", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const tool = asExecutable(createVerifyUrlLiveTool());
    const result = (await tool.execute(
      { url: "https://example.com/" },
      ctx,
    )) as { ok: boolean; status: string };

    expect(result.ok).toBe(false);
    expect(result.status).toBe("error");
  });
});

describe("verify_quote_in_source", () => {
  it("returns mode=exact when quote matches a chunk literally (case-insensitive)", async () => {
    const memoryService = {
      findSourceChunksForUrl: async () => [
        {
          chunkIndex: 0,
          text: "Background section. The Cat Is On The Mat. End.",
          embedding: null,
        },
      ],
      embedQuery: async () => [1, 0, 0],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyQuoteInSourceTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/p", quote: "the cat is on the mat" },
      ctx,
    )) as { found: boolean; mode: string | null; chunkIndex: number | null };

    expect(result.found).toBe(true);
    expect(result.mode).toBe("exact");
    expect(result.chunkIndex).toBe(0);
  });

  it("returns mode=fuzzy when literal match fails but cosine similarity ≥ 0.85", async () => {
    const memoryService = {
      findSourceChunksForUrl: async () => [
        { chunkIndex: 0, text: "unrelated paragraph", embedding: [1, 0, 0] },
        { chunkIndex: 1, text: "another paragraph", embedding: [0.9, 0.05, 0] },
      ],
      embedQuery: async () => [1, 0, 0],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyQuoteInSourceTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/p", quote: "non-literal phrasing" },
      ctx,
    )) as {
      found: boolean;
      mode: string | null;
      chunkIndex: number | null;
      similarity: number | null;
    };

    expect(result.found).toBe(true);
    expect(result.mode).toBe("fuzzy");
    expect(result.chunkIndex).toBe(0);
    expect(result.similarity).toBeGreaterThanOrEqual(0.85);
  });

  it("returns found=false reason=below_threshold when similarity is too low", async () => {
    const memoryService = {
      findSourceChunksForUrl: async () => [
        { chunkIndex: 0, text: "unrelated", embedding: [1, 0, 0] },
      ],
      embedQuery: async () => [0, 1, 0],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyQuoteInSourceTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/p", quote: "another" },
      ctx,
    )) as { found: boolean; reason: string };

    expect(result.found).toBe(false);
    expect(result.reason).toBe("below_threshold");
  });

  it("returns reason=no_cached_chunks when nothing is cached for the URL", async () => {
    const memoryService = {
      findSourceChunksForUrl: async () => [],
      embedQuery: async () => [1, 0, 0],
    } as unknown as MemoryService;

    const tool = asExecutable(
      createVerifyQuoteInSourceTool({ memoryService, ownerUserId: "u1" }),
    );

    const result = (await tool.execute(
      { sourceUrl: "https://example.com/p", quote: "anything" },
      ctx,
    )) as { found: boolean; reason: string };

    expect(result.found).toBe(false);
    expect(result.reason).toBe("no_cached_chunks");
  });
});
