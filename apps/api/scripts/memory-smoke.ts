// E2E smoke for Phase 3 memory layer. Runs real openai embeddings against the
// real DATABASE_URL. Cleans up its own rows on success.
//
//   bun run scripts/memory-smoke.ts
//
import { openai } from "@ai-sdk/openai";
import { and, eq, sql } from "drizzle-orm";
import {
  researchEvidenceCards,
  sourceChunks,
  sources,
} from "@aqsha/db";
import { env } from "../src/config";
import { database } from "../src/database/client";
import { MemoryRepository } from "../src/modules/memory/repository";
import { MemoryService, flattenCardsToRows } from "../src/modules/memory/service";
import { urlNormalizeAndHash } from "../src/modules/memory/url-hash";
import { chunkText } from "../src/modules/memory/chunk";
import type { EvidenceCards } from "../src/agents/subagents/schemas";

type Stage = { name: string; ok: boolean; detail: string };

function log(stage: string, detail: string) {
  console.log(`  ✓ ${stage} — ${detail}`);
}

async function main() {
  const stages: Stage[] = [];

  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing — needed for embeddings.");
  }

  // 1. Find a real user (FK target) to scope writes under.
  const userRows = await database.execute<{ id: string; email: string }>(
    sql`SELECT id, email FROM users LIMIT 1`,
  );
  const user = (userRows as unknown as { id: string; email: string }[])[0];
  if (!user) throw new Error("No users in DB — create one before running smoke.");
  log("user", `${user.email} (${user.id})`);

  const repo = new MemoryRepository(database);
  const embeddingModel = openai.textEmbedding(env.ASTRA_EMBEDDING_MODEL);
  const service = new MemoryService(repo, embeddingModel);

  // 2. Pure helper sanity checks.
  const hashA = urlNormalizeAndHash("https://Example.com/Path/?utm_source=x&b=2&a=1");
  const hashB = urlNormalizeAndHash("https://example.com/Path?a=1&b=2");
  if (hashA !== hashB) {
    throw new Error(`urlNormalizeAndHash not canonical: ${hashA} vs ${hashB}`);
  }
  log("urlNormalizeAndHash", "case + UTM + query order canonicalised");

  const chunked = chunkText("a".repeat(3500), { size: 1500 });
  if (chunked.length !== Math.ceil(3500 / 1500)) {
    throw new Error(`chunkText size mismatch: got ${chunked.length}`);
  }
  log("chunkText", `3500 chars → ${chunked.length} chunks`);

  const sampleCards: EvidenceCards = {
    cards: [
      {
        sourceUrl: "https://memory-smoke.example/glp1-renal-2024",
        sourceTitle: "GLP-1 receptor agonists and renal outcomes (2024 RCT)",
        provider: "pubmed",
        tier: "A",
        qualityScore: 3,
        notes: null,
        claims: [
          {
            text: "Semaglutide reduced major kidney events by 24% in the FLOW trial.",
            quote: "primary outcome event reduction of 24% (HR 0.76, 95% CI 0.66-0.88)",
            importantNumbers: [
              { value: "24", unit: "%" },
              { value: "0.76", unit: "HR" },
            ],
            confidence: "high",
          },
          {
            text: "Effect was consistent across baseline eGFR strata.",
            quote: null,
            importantNumbers: [],
            confidence: "medium",
          },
        ],
      },
    ],
  };
  const flat = flattenCardsToRows(sampleCards.cards, {
    ownerUserId: user.id,
  });
  if (flat.length !== 2) {
    throw new Error(`flattenCardsToRows expected 2 rows, got ${flat.length}`);
  }
  log("flattenCardsToRows", "2 cards × 1 source → 2 claim rows");

  // 3. Store evidence cards (real embedMany call).
  const stored = await service.storeEvidenceCards({
    cards: sampleCards,
    scope: { ownerUserId: user.id },
  });
  if (stored.stored !== 2) {
    throw new Error(`storeEvidenceCards expected 2, got ${stored.stored}`);
  }
  log("storeEvidenceCards", `wrote ${stored.stored} rows w/ embeddings`);

  // 4. Recall by semantically similar query — should hit the high-confidence claim.
  const recalled = await service.recallByQuery(
    "Did GLP-1 drugs improve renal outcomes in the FLOW trial?",
    { ownerUserId: user.id },
    { threshold: 0.4, limit: 5 },
  );
  if (recalled.length === 0) {
    throw new Error("recallByQuery returned no matches");
  }
  const top = recalled[0]!;
  log(
    "recallByQuery",
    `${recalled.length} matches, top similarity=${top.similarity.toFixed(3)} url=${top.sourceUrl}`,
  );

  // 5. Idempotent insert — re-running storeEvidenceCards must NOT duplicate.
  const reinserted = await service.storeEvidenceCards({
    cards: sampleCards,
    scope: { ownerUserId: user.id },
  });
  if (reinserted.stored !== 0) {
    throw new Error(
      `idempotent insert leaked: expected 0 new rows, got ${reinserted.stored}`,
    );
  }
  log("idempotent insert", "ON CONFLICT DO NOTHING fires correctly");

  // 6. Source-cache hot path: simulate a fetch tool result.
  const fakeUrl = "https://memory-smoke.example/glp1-renal-2024";
  const fakeBody = "Background: GLP-1 receptor agonists. ".repeat(60);
  const fakeStep = {
    toolResults: [
      {
        toolName: "fetch_url",
        output: {
          ok: true,
          url: fakeUrl,
          finalUrl: fakeUrl,
          title: "Smoke source",
          textContent: fakeBody,
          length: fakeBody.length,
          truncated: false,
        },
      },
    ],
  };
  const persisted = await service.persistFetchedBodies([fakeStep], {
    ownerUserId: user.id,
  });
  if (persisted.persistedSources !== 1 || persisted.persistedChunks < 1) {
    throw new Error(
      `persistFetchedBodies wrong counts: ${JSON.stringify(persisted)}`,
    );
  }
  log(
    "persistFetchedBodies",
    `${persisted.persistedSources} source / ${persisted.persistedChunks} chunks`,
  );

  // 7. Cache lookup should now resolve the same URL.
  const cache = await service.lookupCachedSources([fakeUrl], {
    ownerUserId: user.id,
  });
  if (cache.size !== 1) {
    throw new Error(`lookupCachedSources expected 1 hit, got ${cache.size}`);
  }
  const hit = cache.get(fakeUrl)!;
  if (!hit.text.includes("GLP-1 receptor agonists")) {
    throw new Error("Cached body missing expected substring");
  }
  log("lookupCachedSources", `${hit.text.length} chars hot from cache`);

  // 8. Cache cap respected.
  if (hit.text.length > env.ASTRA_CACHE_MAX_CHARS) {
    throw new Error(
      `Cache returned ${hit.text.length} chars, exceeds ASTRA_CACHE_MAX_CHARS=${env.ASTRA_CACHE_MAX_CHARS}`,
    );
  }
  log("ASTRA_CACHE_MAX_CHARS", `respected (cap ${env.ASTRA_CACHE_MAX_CHARS})`);

  // 9. URL not in cache → no false positive.
  const miss = await service.lookupCachedSources(
    ["https://memory-smoke.example/never-fetched"],
    { ownerUserId: user.id },
  );
  if (miss.size !== 0) {
    throw new Error(`lookupCachedSources should miss, returned ${miss.size}`);
  }
  log("cache miss path", "uncached URL correctly absent");

  // 10. Re-persist the same URL — upsert should replace chunks (no duplicate-key error).
  const reupserted = await service.persistFetchedBodies([fakeStep], {
    ownerUserId: user.id,
  });
  if (reupserted.persistedSources !== 1) {
    throw new Error(`re-upsert failed: ${JSON.stringify(reupserted)}`);
  }
  log("upsertSourceWithChunks", "same URL re-fetched cleanly (no FK violation)");

  // 11. Cleanup — keep the DB tidy for the user.
  await database
    .delete(sourceChunks)
    .where(
      sql`source_id IN (SELECT id FROM sources WHERE owner_user_id = ${user.id} AND url_hash = ${urlNormalizeAndHash(fakeUrl)})`,
    );
  await database
    .delete(sources)
    .where(
      and(
        eq(sources.ownerUserId, user.id),
        eq(sources.urlHash, urlNormalizeAndHash(fakeUrl)),
      ),
    );
  await database
    .delete(researchEvidenceCards)
    .where(
      and(
        eq(researchEvidenceCards.ownerUserId, user.id),
        eq(researchEvidenceCards.sourceUrl, sampleCards.cards[0]!.sourceUrl),
      ),
    );
  log("cleanup", "smoke rows removed");

  stages.push({ name: "all", ok: true, detail: "ok" });
  console.log("\nPhase 3 memory smoke: PASS");
  process.exit(0);
}

main().catch((err) => {
  console.error("\nPhase 3 memory smoke: FAIL");
  console.error(err);
  process.exit(1);
});
