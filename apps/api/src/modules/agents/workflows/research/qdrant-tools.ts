import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { QdrantClient } from "@qdrant/js-client-rest";
import { z } from "zod";
import { env } from "../../../../config";

const paperCollection = "academic-paper-v1";
const chunkCollection = "academic-chunk-v1";

/**
 * Qdrant-backed research MCP server (design v2 §5, §13).
 *
 * Exposes:
 *   - check_coverage: does the query return any results above threshold?
 *   - vector_search:  embed the query with text-embedding-3-small and run
 *                     a cosine vector search against academic-chunk-v1.
 *   - get_chunk:      fetch a single chunk by point id.
 *
 * `vector_search` requires OPENAI_API_KEY. If the key is not configured, the
 * tool returns an explanatory error so the researcher can fall back to
 * WebSearch / WebFetch instead of silently producing empty results.
 */
export function createQdrantResearchServer() {
  const client = new QdrantClient({
    url: env.QDRANT_URL,
    apiKey: env.QDRANT_API_KEY,
  });

  return createSdkMcpServer({
    name: "aqsha-qdrant-research",
    version: "1.0.0",
    tools: [
      tool(
        "check_coverage",
        "Check whether an academic query has non-empty coverage in the Qdrant index. Runs a small vector search and returns match counts above a score threshold. Falls back to collection-existence check if the embedding provider is unavailable.",
        {
          query: z.string().min(1),
          scoreThreshold: z.number().min(0).max(1).default(0.35),
        },
        async ({ query, scoreThreshold }) => {
          const collections = await client.getCollections();
          const names = new Set(
            collections.collections.map((c) => c.name),
          );
          const hasChunk = names.has(chunkCollection);

          if (!hasChunk) {
            return jsonContent({
              coverage: "unknown",
              reason: "chunk collection missing",
              chunkCollection,
            });
          }

          if (!env.OPENAI_API_KEY) {
            return jsonContent({
              coverage: "unknown",
              reason:
                "OPENAI_API_KEY not configured; cannot embed query for coverage check. Use WebSearch/WebFetch.",
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
            return jsonContent({
              coverage: hits >= 3 ? "sufficient" : hits > 0 ? "partial" : "insufficient",
              hits,
              scoreThreshold,
            });
          } catch (error) {
            return jsonContent({
              coverage: "unknown",
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "vector_search",
        "Cosine vector search over academic-chunk-v1 using text-embedding-3-small. Optional payload filters: indonesiaAffiliated, contentTier, paperType, language, minYear, maxYear. Returns points with payload.",
        {
          query: z.string().min(1),
          limit: z.number().int().min(1).max(20).default(8),
          indonesiaAffiliated: z.boolean().optional(),
          contentTier: z.string().optional(),
          paperType: z.string().optional(),
          language: z.string().optional(),
          minYear: z.number().int().optional(),
          maxYear: z.number().int().optional(),
        },
        async ({
          query,
          limit,
          indonesiaAffiliated,
          contentTier,
          paperType,
          language,
          minYear,
          maxYear,
        }) => {
          if (!env.OPENAI_API_KEY) {
            return jsonContent({
              error:
                "OPENAI_API_KEY is not configured. Use WebSearch or WebFetch for this query.",
              points: [],
            });
          }

          let vector: number[];
          try {
            vector = await embedQuery(query);
          } catch (error) {
            return jsonContent({
              error: error instanceof Error ? error.message : String(error),
              points: [],
            });
          }

          const must: unknown[] = [];
          if (indonesiaAffiliated !== undefined) {
            must.push({
              key: "indonesiaAffiliated",
              match: { value: indonesiaAffiliated },
            });
          }
          if (contentTier) must.push({ key: "contentTier", match: { value: contentTier } });
          if (paperType) must.push({ key: "paperType", match: { value: paperType } });
          if (language) must.push({ key: "language", match: { value: language } });
          if (minYear !== undefined || maxYear !== undefined) {
            must.push({
              key: "year",
              range: {
                gte: minYear,
                lte: maxYear,
              },
            });
          }

          const res = await client.query(chunkCollection, {
            query: vector,
            limit,
            with_payload: true,
            filter: must.length > 0 ? { must } : undefined,
          });
          return jsonContent({
            embeddingModel: env.AGENT_EMBEDDING_MODEL,
            embeddingVersion: "v1",
            points: res.points ?? [],
          });
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "get_chunk",
        "Fetch a single indexed academic chunk by Qdrant point id.",
        {
          id: z.union([z.string(), z.number()]),
        },
        async ({ id }) => {
          const points = await client.retrieve(chunkCollection, {
            ids: [id],
            with_payload: true,
            with_vector: false,
          });
          return jsonContent(points[0] ?? null);
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });
}

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.AGENT_EMBEDDING_MODEL,
      input: text,
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI embeddings failed (${response.status}): ${body}`);
  }
  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const embedding = data.data?.[0]?.embedding;
  if (!embedding) throw new Error("OpenAI embeddings response missing data");
  return embedding;
}

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value),
      },
    ],
  };
}

// Re-export collection names for orchestrator / repository use if needed.
export { paperCollection, chunkCollection };
