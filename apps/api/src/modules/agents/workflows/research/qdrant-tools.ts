import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { QdrantClient } from "@qdrant/js-client-rest";
import { z } from "zod";
import { env } from "../../../../config";

const paperCollection = "academic-paper-v1";
const chunkCollection = "academic-chunk-v1";

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
        "Check whether the academic paper and chunk collections are reachable.",
        {},
        async () => {
          const collections = await client.getCollections();
          const names = new Set(
            collections.collections.map((collection) => collection.name),
          );

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  paperCollection,
                  chunkCollection,
                  hasPaperCollection: names.has(paperCollection),
                  hasChunkCollection: names.has(chunkCollection),
                }),
              },
            ],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        "hybrid_search",
        "Search indexed academic chunks by text query.",
        {
          query: z.string().min(1),
          limit: z.number().int().min(1).max(20).default(8),
        },
        async ({ query, limit }) => {
          const result = await client.scroll(chunkCollection, {
            limit,
            with_payload: true,
            filter: {
              must: [
                {
                  key: "text",
                  match: { text: query },
                },
              ],
            },
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(result.points),
              },
            ],
          };
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

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(points[0] ?? null),
              },
            ],
          };
        },
        { annotations: { readOnlyHint: true } },
      ),
    ],
  });
}
