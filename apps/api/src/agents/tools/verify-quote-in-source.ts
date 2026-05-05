import { tool } from "ai";
import { z } from "zod";
import type { MemoryService } from "../../modules/memory/service";

export type VerifyQuoteInSourceDeps = {
  memoryService: MemoryService;
  ownerUserId: string;
};

const FUZZY_THRESHOLD = 0.85;

export function createVerifyQuoteInSourceTool(deps: VerifyQuoteInSourceDeps) {
  return tool({
    description:
      "Verify a direct quote actually appears in the cached body of a source. First tries an exact normalized substring match against stored chunks; falls back to a fuzzy embedding match (cosine ≥ 0.85). Returns found=false when neither passes — emit unverifiable_quote in that case.",
    inputSchema: z.object({
      sourceUrl: z.string().min(1),
      quote: z.string().min(1),
    }),
    execute: async ({ sourceUrl, quote }) => {
      const chunks = await deps.memoryService.findSourceChunksForUrl(
        deps.ownerUserId,
        sourceUrl,
      );

      if (chunks.length === 0) {
        return {
          found: false,
          mode: null,
          chunkIndex: null,
          similarity: null,
          reason: "no_cached_chunks",
        };
      }

      const normalizedQuote = normalize(quote);
      for (const chunk of chunks) {
        if (normalize(chunk.text).includes(normalizedQuote)) {
          return {
            found: true,
            mode: "exact" as const,
            chunkIndex: chunk.chunkIndex,
            similarity: 1,
            reason: null,
          };
        }
      }

      const queryEmbedding = await deps.memoryService.embedQuery(quote);
      if (!queryEmbedding) {
        return {
          found: false,
          mode: null,
          chunkIndex: null,
          similarity: null,
          reason: "embed_failed",
        };
      }

      let bestSim = -1;
      let bestChunk: number | null = null;
      for (const chunk of chunks) {
        if (!chunk.embedding) continue;
        const sim = cosineSimilarity(queryEmbedding, chunk.embedding);
        if (sim > bestSim) {
          bestSim = sim;
          bestChunk = chunk.chunkIndex;
        }
      }

      if (bestChunk === null) {
        return {
          found: false,
          mode: null,
          chunkIndex: null,
          similarity: null,
          reason: "no_chunk_embeddings",
        };
      }

      const passed = bestSim >= FUZZY_THRESHOLD;
      return {
        found: passed,
        mode: passed ? ("fuzzy" as const) : null,
        chunkIndex: bestChunk,
        similarity: Number(bestSim.toFixed(4)),
        reason: passed ? null : "below_threshold",
      };
    },
  });
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i += 1) {
    const ai = a[i]!;
    const bi = b[i]!;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
