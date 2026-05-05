import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  researchEvidenceCards,
  sourceChunks,
  sources,
  type JsonValue,
} from "@aqsha/db";
import type { DatabaseClient } from "../../database/client";
import type {
  CachedSource,
  ChunkInsert,
  EvidenceCardEmbeddedInsert,
  RecallMatch,
  SourceUpsertInput,
} from "./model";

function vectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

export class MemoryRepository {
  constructor(private readonly db: DatabaseClient) {}

  async insertCards(rows: EvidenceCardEmbeddedInsert[]): Promise<number> {
    if (rows.length === 0) return 0;

    const values = rows.map((row) => ({
      ownerUserId: row.ownerUserId,
      chatThreadId: row.chatThreadId,
      runId: row.runId,
      chatSourceId: row.chatSourceId,
      sourceUrl: row.sourceUrl,
      sourceTitle: row.sourceTitle,
      claimText: row.claimText,
      quote: row.quote,
      importantNumbers: row.importantNumbers as unknown as JsonValue,
      confidence: row.confidence,
      tier: row.tier,
      qualityScore: row.qualityScore,
      provider: row.provider,
      notes: row.notes,
      embedding: row.embedding,
    }));

    const inserted = await this.db
      .insert(researchEvidenceCards)
      .values(values)
      .onConflictDoNothing({
        target: [
          researchEvidenceCards.ownerUserId,
          researchEvidenceCards.sourceUrl,
          researchEvidenceCards.claimText,
        ],
      })
      .returning({ id: researchEvidenceCards.id });

    return inserted.length;
  }

  async recall(
    ownerUserId: string,
    embedding: number[],
    threshold: number,
    limit: number,
  ): Promise<RecallMatch[]> {
    const literal = vectorLiteral(embedding);
    type Row = {
      id: string;
      source_url: string;
      source_title: string | null;
      claim_text: string;
      quote: string | null;
      tier: string;
      quality_score: number;
      provider: string | null;
      similarity: number;
      created_at: Date | string;
    };
    const result = (await this.db.execute<Row>(sql`
      SELECT
        id,
        source_url,
        source_title,
        claim_text,
        quote,
        tier,
        quality_score,
        provider,
        1 - (embedding <=> ${literal}::vector) AS similarity,
        created_at
      FROM research_evidence_cards
      WHERE owner_user_id = ${ownerUserId}
        AND 1 - (embedding <=> ${literal}::vector) >= ${threshold}
      ORDER BY embedding <=> ${literal}::vector ASC
      LIMIT ${limit}
    `)) as unknown as Row[];

    const rows = extractRows<Row>(result);
    return rows.map((row) => ({
      cardId: row.id,
      sourceUrl: row.source_url,
      sourceTitle: row.source_title,
      claimText: row.claim_text,
      quote: row.quote,
      tier: row.tier as RecallMatch["tier"],
      qualityScore: Number(row.quality_score),
      provider: row.provider,
      similarity: Number(row.similarity),
      firstSeenAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : new Date(row.created_at).toISOString(),
    }));
  }

  async lookupSourcesByUrlHash(
    ownerUserId: string,
    urlHashes: string[],
  ): Promise<CachedSource[]> {
    if (urlHashes.length === 0) return [];

    const sourceRows = await this.db
      .select({
        id: sources.id,
        urlHash: sources.urlHash,
        sourceUrl: sources.sourceUrl,
        title: sources.title,
        readyAt: sources.readyAt,
        createdAt: sources.createdAt,
      })
      .from(sources)
      .where(
        and(
          eq(sources.ownerUserId, ownerUserId),
          eq(sources.status, "ready"),
          inArray(sources.urlHash, urlHashes),
        ),
      );

    if (sourceRows.length === 0) return [];

    const sourceIds = sourceRows.map((row) => row.id);
    const chunkRows = await this.db
      .select({
        sourceId: sourceChunks.sourceId,
        chunkIndex: sourceChunks.chunkIndex,
        text: sourceChunks.text,
      })
      .from(sourceChunks)
      .where(inArray(sourceChunks.sourceId, sourceIds))
      .orderBy(asc(sourceChunks.sourceId), asc(sourceChunks.chunkIndex));

    const grouped = new Map<string, string[]>();
    for (const chunk of chunkRows) {
      const list = grouped.get(chunk.sourceId) ?? [];
      list.push(chunk.text);
      grouped.set(chunk.sourceId, list);
    }

    return sourceRows.flatMap<CachedSource>((source) => {
      const chunks = grouped.get(source.id);
      if (!chunks || chunks.length === 0 || !source.sourceUrl) {
        return [];
      }
      const fetchedAtSrc = source.readyAt ?? source.createdAt;
      return [
        {
          url: source.sourceUrl,
          title: source.title,
          text: chunks.join("\n\n"),
          fetchedAt:
            fetchedAtSrc instanceof Date
              ? fetchedAtSrc.toISOString()
              : new Date(fetchedAtSrc).toISOString(),
        },
      ];
    });
  }

  async upsertSourceWithChunks(
    input: SourceUpsertInput,
    chunks: ChunkInsert[],
  ): Promise<{ sourceId: string; chunkCount: number }> {
    return await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: sources.id })
        .from(sources)
        .where(
          and(
            eq(sources.ownerUserId, input.ownerUserId),
            eq(sources.urlHash, input.urlHash),
          ),
        )
        .limit(1);

      let sourceId = existing?.id;

      if (sourceId) {
        await tx
          .update(sources)
          .set({
            status: "ready",
            sourceUrl: input.sourceUrl,
            title: input.title,
            mimeType: input.mimeType,
            pageCount: input.pageCount,
            readyAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(sources.id, sourceId));
        await tx.delete(sourceChunks).where(eq(sourceChunks.sourceId, sourceId));
      } else {
        const [inserted] = await tx
          .insert(sources)
          .values({
            ownerUserId: input.ownerUserId,
            urlHash: input.urlHash,
            sourceUrl: input.sourceUrl,
            title: input.title,
            mimeType: input.mimeType,
            pageCount: input.pageCount,
            status: "ready",
            readyAt: new Date(),
          })
          .returning({ id: sources.id });
        sourceId = inserted.id;
      }

      if (chunks.length > 0) {
        await tx.insert(sourceChunks).values(
          chunks.map((chunk, idx) => ({
            sourceId: sourceId!,
            chunkIndex: idx,
            text: chunk.text,
            embedding: chunk.embedding,
          })),
        );
      }

      return { sourceId: sourceId!, chunkCount: chunks.length };
    });
  }
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows: unknown }).rows;
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}
