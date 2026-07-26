/**
 * Funnel write feed_items — SATU-SATUNYA jalur tulis. Map paper → buildFeedItemRow
 * (derive orderAt) → FeedRepo.upsertByDedupeKey. Semua lane hydration + materialisasi paper
 * WAJIB lewat sini supaya invariant derive selalu jalan.
 */
import { type DbOrTx, type FeedItem, FeedRepo } from "@aqsha/db";
import type { LiteraturePaper } from "../papers/work";
import { buildFeedItemRow } from "./model";

export async function upsertFeedItems(
  db: DbOrTx,
  papers: LiteraturePaper[],
  now: number,
): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (const paper of papers) {
    out.push(await FeedRepo.upsertByDedupeKey(db, buildFeedItemRow(paper, now)));
  }
  return out;
}
