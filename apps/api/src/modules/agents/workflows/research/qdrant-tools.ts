import { tool, type Tool } from "@openai/agents";
import { QdrantClient } from "@qdrant/js-client-rest";
import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../../../config";

const paperCollection = "academic-paper-v1";
const chunkCollection = "academic-chunk-v1";

/**
 * Qdrant-backed research tools (design v2 §5, §13).
 *
 * Exposes function tools to the OpenAI Agents SDK:
 *   - qdrant_check_coverage: does the query return results above threshold?
 *   - qdrant_vector_search:  embed the query with text-embedding-3-small and
 *                            run cosine vector search over academic-chunk-v1.
 *   - qdrant_get_chunk:      fetch a single chunk by point id.
 *
 * `qdrant_vector_search` requires OPENAI_API_KEY (enforced by sdk-runner).
 */
export function createQdrantResearchTools(): Tool<unknown>[] {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });
  const openai = env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: env.OPENAI_API_KEY })
    : null;

  const embedQuery = async (text: string): Promise<number[]> => {
    if (!openai) {
      throw new Error("OPENAI_API_KEY is not configured");
    }
    const response = await openai.embeddings.create({
      model: env.AGENT_EMBEDDING_MODEL,
      input: text,
    });
    const embedding = response.data?.[0]?.embedding;
    if (!embedding || embedding.length === 0) {
      throw new Error("OpenAI embeddings response missing data");
    }
    return embedding;
  };

  const checkCoverage = tool({
    name: "qdrant_check_coverage",
    description:
      "Check whether an academic query has non-empty coverage in the Qdrant index. Runs a small vector search and returns match counts above a score threshold.",
    parameters: z.object({
      query: z.string().min(1),
      scoreThreshold: z.number().min(0).max(1).default(0.35),
    }),
    async execute({ query, scoreThreshold }) {
      const collections = await client.getCollections();
      const names = new Set(collections.collections.map((c) => c.name));
      if (!names.has(chunkCollection)) {
        return JSON.stringify({
          coverage: "unknown",
          reason: "chunk collection missing",
          chunkCollection,
        });
      }

      if (!openai) {
        return JSON.stringify({
          coverage: "unknown",
          reason:
            "OPENAI_API_KEY not configured; cannot embed query for coverage check. Use web_search.",
        });
      }

      try {
        const vector = await embedQuery(query);
        const res = await client.query(chunkCollection, {
          query: vector,
          limit: 8,
          with_payload: false,
          score_threshold: scoreThreshold,
        });
        const hits = res.points?.length ?? 0;
        return JSON.stringify({
          coverage:
            hits >= 3 ? "sufficient" : hits > 0 ? "partial" : "insufficient",
          hits,
          scoreThreshold,
        });
      } catch (error) {
        return JSON.stringify({
          coverage: "unknown",
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  const vectorSearch = tool({
    name: "qdrant_vector_search",
    description:
      "Cosine vector search over academic-chunk-v1 using text-embedding-3-small. Optional payload filters: indonesiaAffiliated, contentTier, paperType, language, minYear, maxYear. Returns points with payload.",
    parameters: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(8),
      indonesiaAffiliated: z.boolean().nullable().default(null),
      contentTier: z.string().nullable().default(null),
      paperType: z.string().nullable().default(null),
      language: z.string().nullable().default(null),
      minYear: z.number().int().nullable().default(null),
      maxYear: z.number().int().nullable().default(null),
    }),
    async execute(params) {
      if (!openai) {
        return JSON.stringify({
          error:
            "OPENAI_API_KEY is not configured. Use web_search for this query.",
          points: [],
        });
      }

      let vector: number[];
      try {
        vector = await embedQuery(params.query);
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          points: [],
        });
      }

      const must: unknown[] = [];
      if (params.indonesiaAffiliated !== null) {
        must.push({
          key: "indonesiaAffiliated",
          match: { value: params.indonesiaAffiliated },
        });
      }
      if (params.contentTier) {
        must.push({ key: "contentTier", match: { value: params.contentTier } });
      }
      if (params.paperType) {
        must.push({ key: "paperType", match: { value: params.paperType } });
      }
      if (params.language) {
        must.push({ key: "language", match: { value: params.language } });
      }
      if (params.minYear !== null || params.maxYear !== null) {
        must.push({
          key: "year",
          range: {
            gte: params.minYear ?? undefined,
            lte: params.maxYear ?? undefined,
          },
        });
      }

      const res = await client.query(chunkCollection, {
        query: vector,
        limit: params.limit,
        with_payload: true,
        filter: must.length > 0 ? { must } : undefined,
      });
      return JSON.stringify({
        embeddingModel: env.AGENT_EMBEDDING_MODEL,
        embeddingVersion: "v1",
        points: res.points ?? [],
      });
    },
  });

  const getChunk = tool({
    name: "qdrant_get_chunk",
    description: "Fetch a single indexed academic chunk by Qdrant point id.",
    parameters: z.object({
      id: z.union([z.string(), z.number()]),
    }),
    async execute({ id }) {
      const points = await client.retrieve(chunkCollection, {
        ids: [id],
        with_payload: true,
        with_vector: false,
      });
      return JSON.stringify(points[0] ?? null);
    },
  });

  return [checkCoverage, vectorSearch, getChunk];
}

export { paperCollection, chunkCollection };
