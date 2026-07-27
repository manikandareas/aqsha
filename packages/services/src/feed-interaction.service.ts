/**
 * FeedInteractionService — save/unsave/hide/record (P4). Port V1 feed save/hide/discovery
 * mutations + helper. Jalur id-based DAN ref-based (DiscoveryItemRef) lewat helper yang sama;
 * `saveDiscoveryItem` materialisasi paper sekali via `ensureFeedItemForPaperKey` + interest +1,
 * hide −1, research +2. Ownership owner-scoped di repo (semua query by ownerUserId).
 */
import {
  type DbOrTx,
  type DiscoveryRefRow,
  FeedInteractionRepo,
  FeedRepo,
} from "@aqsha/db";
import { InterestService } from "./interest.service";
import { explorePaperToLiteraturePaper } from "./papers/work";
import { upsertFeedItems } from "./feed/write";
import { PaperCacheService } from "./paper-cache.service";

export type DiscoveryItemRef =
  | { kind: "feed"; feedItemId: string }
  | { kind: "paper"; paperKey: string };

export type DiscoveryResolvedRef =
  | { kind: "feed"; feedItemId: string }
  | { kind: "paper"; paperKey: string };

export type InteractionKind = "save" | "hide" | "research" | "open_evidence";

const SAVED_REFS_CAP = 500;

// ── private helpers (port V1) ───────────────────────────────────────────────

/** Resolve baris feed untuk paperKey; materialisasi dari cache explore_papers bila perlu. */
async function ensureFeedItemForPaperKey(db: DbOrTx, paperKey: string): Promise<string | null> {
  const existing = await FeedRepo.findByDedupeKey(db, `paper:${paperKey}`);
  if (existing) return existing.id;

  const paper = await PaperCacheService.getByKey(db as never, paperKey);
  if (!paper) return null;

  const [row] = await upsertFeedItems(
    db,
    [
      explorePaperToLiteraturePaper({
        key: paper.key,
        title: paper.title,
        snippet: paper.snippet ?? null,
        url: paper.url,
        pdfUrl: paper.pdfUrl ?? null,
        doi: paper.doi ?? null,
        authors: paper.authors,
        year: paper.year ?? null,
        publicationDate: paper.publicationDate ?? null,
        venue: paper.venue ?? null,
        citedByCount: paper.citedByCount ?? null,
        isOpenAccess: paper.isOpenAccess ?? null,
        oaStatus: paper.oaStatus ?? null,
        workType: paper.workType ?? null,
        language: paper.language ?? null,
        isRetracted: paper.isRetracted ?? false,
        topics: paper.topics,
      }),
    ],
    Date.now(),
  );
  return row?.id ?? null;
}

/** Resolve feed id dari ref. kind=feed → verifikasi ada; kind=paper → existing/materialize. */
async function resolveDiscoveryFeedItem(
  db: DbOrTx,
  itemRef: DiscoveryItemRef,
  opts: { materializePaper: boolean },
): Promise<string | null> {
  if (itemRef.kind === "feed") {
    const row = await FeedRepo.findById(db, itemRef.feedItemId);
    return row ? row.id : null;
  }
  if (!opts.materializePaper) {
    const existing = await FeedRepo.findByDedupeKey(db, `paper:${itemRef.paperKey}`);
    return existing?.id ?? null;
  }
  return ensureFeedItemForPaperKey(db, itemRef.paperKey);
}

async function topicsOf(db: DbOrTx, feedItemId: string): Promise<string[]> {
  const row = await FeedRepo.findById(db, feedItemId);
  return row?.topics ?? [];
}

/** Save idempotent + log interaksi + bump minat +1. Port saveFeedItemForUser. */
async function saveFeedItemForUser(
  db: DbOrTx,
  ownerUserId: string,
  feedItemId: string,
): Promise<boolean> {
  const existing = await FeedInteractionRepo.findSaved(db, ownerUserId, feedItemId);
  if (existing) return true;
  const now = Date.now();
  await FeedInteractionRepo.insertSaved(db, {
    id: crypto.randomUUID(),
    ownerUserId,
    feedItemId,
    createdAt: now,
  });
  await FeedInteractionRepo.insertInteraction(db, {
    id: crypto.randomUUID(),
    ownerUserId,
    feedItemId,
    kind: "save",
    createdAt: now,
  });
  await InterestService.bump(db, ownerUserId, await topicsOf(db, feedItemId), 1);
  return true;
}

/** Hide idempotent + log interaksi + decay minat −1. Port hideFeedItemFull. */
async function hideFeedItemFull(
  db: DbOrTx,
  ownerUserId: string,
  feedItemId: string,
): Promise<void> {
  const now = Date.now();
  await FeedInteractionRepo.insertHidden(db, {
    id: crypto.randomUUID(),
    ownerUserId,
    feedItemId,
    createdAt: now,
  });
  await FeedInteractionRepo.insertInteraction(db, {
    id: crypto.randomUUID(),
    ownerUserId,
    feedItemId,
    kind: "hide",
    createdAt: now,
  });
  await InterestService.bump(db, ownerUserId, await topicsOf(db, feedItemId), -1);
}

/** Append interaksi + efek samping (hide hides, save +1, research +2). Port recordFeedInteractionForUser. */
async function recordFeedInteractionForUser(
  db: DbOrTx,
  ownerUserId: string,
  feedItemId: string,
  kind: InteractionKind,
): Promise<void> {
  const now = Date.now();
  await FeedInteractionRepo.insertInteraction(db, {
    id: crypto.randomUUID(),
    ownerUserId,
    feedItemId,
    kind,
    createdAt: now,
  });
  if (kind === "hide") {
    await FeedInteractionRepo.insertHidden(db, {
      id: crypto.randomUUID(),
      ownerUserId,
      feedItemId,
      createdAt: now,
    });
  }
  if (kind === "save") {
    await InterestService.bump(db, ownerUserId, await topicsOf(db, feedItemId), 1);
  }
  if (kind === "research") {
    await InterestService.bump(db, ownerUserId, await topicsOf(db, feedItemId), 2);
  }
}

function refsForRow(row: DiscoveryRefRow): DiscoveryResolvedRef[] {
  const refs: DiscoveryResolvedRef[] = [{ kind: "feed", feedItemId: row.feedItemId }];
  if (row.paperKey) refs.push({ kind: "paper", paperKey: row.paperKey });
  return refs;
}

// ── public API ──────────────────────────────────────────────────────────────

export const FeedInteractionService = {
  /** Save unified (feed/paper). Materialisasi paper sekali + saved row + interest +1. Idempotent. */
  async saveDiscoveryItem(
    db: DbOrTx,
    ownerUserId: string,
    itemRef: DiscoveryItemRef,
  ): Promise<{ saved: boolean }> {
    const feedItemId = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: true });
    if (!feedItemId) return { saved: false };
    return { saved: await saveFeedItemForUser(db, ownerUserId, feedItemId) };
  },

  /** Unsave (tanpa materialisasi — resolve existing saja). */
  async unsaveDiscoveryItem(
    db: DbOrTx,
    ownerUserId: string,
    itemRef: DiscoveryItemRef,
  ): Promise<{ saved: false }> {
    const feedItemId = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: false });
    if (feedItemId) await FeedInteractionRepo.deleteSaved(db, ownerUserId, feedItemId);
    return { saved: false };
  },

  /** Hide unified. Materialisasi paper supaya bisa difilter dari search. Interest −1. */
  async hideDiscoveryItem(
    db: DbOrTx,
    ownerUserId: string,
    itemRef: DiscoveryItemRef,
  ): Promise<{ ok: true }> {
    const feedItemId = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: true });
    if (feedItemId) await hideFeedItemFull(db, ownerUserId, feedItemId);
    return { ok: true };
  },

  /** Telemetri + sinyal minat by ref (save +1 / research +2 / hide hides / open_evidence telemetry). */
  async recordDiscoveryInteraction(
    db: DbOrTx,
    ownerUserId: string,
    itemRef: DiscoveryItemRef,
    kind: InteractionKind,
  ): Promise<{ ok: true }> {
    const feedItemId = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: true });
    if (feedItemId) await recordFeedInteractionForUser(db, ownerUserId, feedItemId, kind);
    return { ok: true };
  },

  /** Resolve ref saved (probe spesifik atau set terbaru). Port getSavedDiscoveryRefs. */
  async getSavedDiscoveryRefs(
    db: DbOrTx,
    ownerUserId: string,
    args: { itemRefs?: DiscoveryItemRef[]; limit?: number },
  ): Promise<{ refs: DiscoveryResolvedRef[] }> {
    if (args.itemRefs) {
      const refs: DiscoveryResolvedRef[] = [];
      for (const itemRef of args.itemRefs.slice(0, 80)) {
        const row = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: false });
        if (!row) continue;
        if (!(await FeedInteractionRepo.findSaved(db, ownerUserId, row))) continue;
        const feed = await FeedRepo.findById(db, row);
        if (feed) refs.push(...refsForRow({ feedItemId: feed.id, paperKey: feed.key }));
      }
      return { refs };
    }
    const limit = Math.min(args.limit ?? 200, SAVED_REFS_CAP);
    const rows = await FeedInteractionRepo.savedRefs(db, ownerUserId, null, limit);
    return { refs: rows.flatMap(refsForRow) };
  },

  /** Resolve ref hidden (probe spesifik atau set terbaru). Port getHiddenDiscoveryRefs. */
  async getHiddenDiscoveryRefs(
    db: DbOrTx,
    ownerUserId: string,
    args: { itemRefs?: DiscoveryItemRef[]; limit?: number },
  ): Promise<{ refs: DiscoveryResolvedRef[] }> {
    if (args.itemRefs) {
      const refs: DiscoveryResolvedRef[] = [];
      for (const itemRef of args.itemRefs.slice(0, 80)) {
        const row = await resolveDiscoveryFeedItem(db, itemRef, { materializePaper: false });
        if (!row) continue;
        if (!(await FeedInteractionRepo.findHidden(db, ownerUserId, row))) continue;
        const feed = await FeedRepo.findById(db, row);
        if (feed) refs.push(...refsForRow({ feedItemId: feed.id, paperKey: feed.key }));
      }
      return { refs };
    }
    const limit = Math.min(args.limit ?? 200, SAVED_REFS_CAP);
    const rows = await FeedInteractionRepo.hiddenRefs(db, ownerUserId, null, limit);
    return { refs: rows.flatMap(refsForRow) };
  },
};
