import { throwAppError } from "@aqsha/db";
import {
  type DiscoveryItemRef,
  FeedInteractionService,
  FeedService,
  PaperCacheService,
} from "@aqsha/services";
import { Elysia, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";

/** Identity unified save/hide/interaction (port discoveryItemRefValidator). */
const DISCOVERY_REF = t.Union([
  t.Object({ kind: t.Literal("feed"), feedItemId: t.String() }),
  t.Object({ kind: t.Literal("paper"), paperKey: t.String() }),
]);

/** Parse `refs` query (JSON DiscoveryItemRef[]) — toleran: invalid → undefined (mode recent). */
function parseRefs(raw: string | undefined): DiscoveryItemRef[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DiscoveryItemRef[]) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Route feed/discovery (P4). Read path tipis: auth → validasi `t` → 1 FeedService call.
 * Tanpa rate-limit (read). Save/hide/interaction + search + reader di slice berikutnya.
 */
const FEED_KIND = t.Union([
  t.Literal("paper"),
  t.Literal("news"),
  t.Literal("claim"),
  t.Literal("topic"),
  t.Literal("idea"),
]);

export const feed = new Elysia({ prefix: "/feed" })
  .use(authMacro)
  // GET /feed — cursor-paginated For You/Top/Topics (infinite scroll).
  .get(
    "/",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return FeedService.getFeedPaginated(db, ownerUserId, {
        cursor: query.cursor,
        limit: query.limit,
        mode: query.mode,
        kinds: query.kinds,
        topic: query.topic,
      });
    },
    {
      auth: true,
      query: t.Object({
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        mode: t.Optional(
          t.Union([t.Literal("foryou"), t.Literal("top"), t.Literal("topics")]),
        ),
        kinds: t.Optional(t.Array(FEED_KIND)),
        topic: t.Optional(
          t.Union([
            t.Literal("sains_teknologi"),
            t.Literal("kesehatan"),
            t.Literal("lingkungan"),
            t.Literal("sosial_ekonomi"),
            t.Literal("pendidikan"),
          ]),
        ),
      }),
    },
  )
  // GET /feed/home — bento home (non-paginated).
  .get(
    "/home",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return FeedService.getFeed(db, ownerUserId, {
        limit: query.limit,
        kinds: query.kinds,
        serendipity: query.serendipity,
      }).then((items) => ({ items }));
    },
    {
      auth: true,
      query: t.Object({
        limit: t.Optional(t.Numeric()),
        kinds: t.Optional(t.Array(FEED_KIND)),
        serendipity: t.Optional(t.Boolean()),
      }),
    },
  )
  // GET /feed/search — full-text search lintas konten (tsvector/GIN), filter kind/fromYear.
  .get(
    "/search",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return FeedService.searchDiscovery(db, ownerUserId, {
        q: query.q,
        cursor: query.cursor,
        limit: query.limit,
        kinds: query.kinds,
        fromYear: query.fromYear,
      });
    },
    {
      auth: true,
      query: t.Object({
        q: t.String(),
        cursor: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        kinds: t.Optional(t.Array(FEED_KIND)),
        fromYear: t.Optional(t.Numeric()),
      }),
    },
  )
  // GET /feed/saved-refs — ref tersimpan (probe `refs` JSON, atau set terbaru via limit).
  .get(
    "/saved-refs",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return FeedInteractionService.getSavedDiscoveryRefs(db, ownerUserId, {
        itemRefs: parseRefs(query.refs),
        limit: query.limit,
      });
    },
    {
      auth: true,
      query: t.Object({ refs: t.Optional(t.String()), limit: t.Optional(t.Numeric()) }),
    },
  )
  // GET /feed/hidden-refs — mirror saved-refs untuk hidden.
  .get(
    "/hidden-refs",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return FeedInteractionService.getHiddenDiscoveryRefs(db, ownerUserId, {
        itemRefs: parseRefs(query.refs),
        limit: query.limit,
      });
    },
    {
      auth: true,
      query: t.Object({ refs: t.Optional(t.String()), limit: t.Optional(t.Numeric()) }),
    },
  )
  // POST /feed/discovery/save — save unified (+ materialize paper + interest +1).
  .post(
    "/discovery/save",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return FeedInteractionService.saveDiscoveryItem(db, ownerUserId, body.itemRef);
    },
    { auth: true, body: t.Object({ itemRef: DISCOVERY_REF }) },
  )
  // POST /feed/discovery/unsave — unsave (tanpa materialize).
  .post(
    "/discovery/unsave",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return FeedInteractionService.unsaveDiscoveryItem(db, ownerUserId, body.itemRef);
    },
    { auth: true, body: t.Object({ itemRef: DISCOVERY_REF }) },
  )
  // POST /feed/discovery/hide — hide unified (+ interest −1).
  .post(
    "/discovery/hide",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return FeedInteractionService.hideDiscoveryItem(db, ownerUserId, body.itemRef);
    },
    { auth: true, body: t.Object({ itemRef: DISCOVERY_REF }) },
  )
  // POST /feed/discovery/interaction — telemetri + sinyal minat (save+1/research+2/hide).
  .post(
    "/discovery/interaction",
    ({ ownerUserId, body }) => {
      const { db } = getDb();
      return FeedInteractionService.recordDiscoveryInteraction(
        db,
        ownerUserId,
        body.itemRef,
        body.kind,
      );
    },
    {
      auth: true,
      body: t.Object({
        itemRef: DISCOVERY_REF,
        kind: t.Union([
          t.Literal("save"),
          t.Literal("hide"),
          t.Literal("research"),
          t.Literal("open_evidence"),
        ]),
      }),
    },
  )
  // GET /feed/papers-by-keys — resolve paper pendukung (evidence drawer) by key.
  .get(
    "/papers-by-keys",
    ({ query }) => {
      const { db } = getDb();
      return PaperCacheService.papersByKeys(db, query.keys ?? []).then((papers) => ({ papers }));
    },
    { auth: true, query: t.Object({ keys: t.Optional(t.Array(t.String())) }) },
  )
  // GET /feed/:id/related — same-kind related ("Discover more").
  .get(
    "/:id/related",
    ({ ownerUserId, params, query }) => {
      const { db } = getDb();
      return FeedService.getRelatedFeedItems(db, ownerUserId, params.id, query.limit).then(
        (items) => ({ items }),
      );
    },
    { auth: true, query: t.Object({ limit: t.Optional(t.Numeric()) }) },
  )
  // GET /feed/:id — single feed item (news/fact detail). 404 saat tak ada.
  .get(
    "/:id",
    async ({ ownerUserId, params }) => {
      const { db } = getDb();
      const item = await FeedService.getFeedItem(db, ownerUserId, params.id);
      if (!item) {
        throwAppError({
          message: "Item tidak ditemukan.",
          code: "feed_item_not_found",
          severity: "info",
          status: 404,
        });
      }
      return item;
    },
    { auth: true },
  );
