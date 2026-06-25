/**
 * Funnel write feed_items — SATU-SATUNYA jalur tulis. Map FeedItemInput → buildFeedItemRow
 * (derive orderAt+searchText) → FeedRepo.upsertByDedupeKey. Semua lane hydration + materialisasi
 * paper WAJIB lewat sini supaya invariant derive selalu jalan.
 */
import { type DbOrTx, type FeedItem, FeedRepo } from "@aqsha/db";
import { buildFeedItemRow, type FeedItemInput } from "./model";

export async function upsertFeedItems(
  db: DbOrTx,
  inputs: FeedItemInput[],
  now: number,
): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (const input of inputs) {
    out.push(await FeedRepo.upsertByDedupeKey(db, buildFeedItemRow(input, now)));
  }
  return out;
}
