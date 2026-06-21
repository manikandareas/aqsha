import { FeedInteractionRepo, FeedRepo } from "@aqsha/db";
import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { FeedInteractionService } from "../src/feed-interaction.service";
import { InterestService } from "../src/interest.service";
import { PaperCacheService } from "../src/paper-cache.service";

const fakeDb = {} as never;
const feedRow = (over: Record<string, unknown> = {}) =>
  ({ id: "F1", topics: ["ml"], paperKey: null, ...over }) as never;

afterEach(() => {
  for (const fn of [
    () => spyOn(FeedRepo, "findById"),
    () => spyOn(FeedRepo, "findByDedupeKey"),
    () => spyOn(FeedRepo, "upsertByDedupeKey"),
    () => spyOn(FeedInteractionRepo, "findSaved"),
    () => spyOn(FeedInteractionRepo, "insertSaved"),
    () => spyOn(FeedInteractionRepo, "insertHidden"),
    () => spyOn(FeedInteractionRepo, "insertInteraction"),
    () => spyOn(InterestService, "bump"),
    () => spyOn(PaperCacheService, "getByKey"),
  ]) {
    fn().mockRestore();
  }
});

describe("FeedInteractionService.saveDiscoveryItem (feed ref)", () => {
  test("save baru → saved row + interaction + interest +1", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow({ topics: ["ml"] }));
    spyOn(FeedInteractionRepo, "findSaved").mockResolvedValue(null);
    const insertSaved = spyOn(FeedInteractionRepo, "insertSaved").mockResolvedValue(undefined);
    spyOn(FeedInteractionRepo, "insertInteraction").mockResolvedValue(undefined);
    const bump = spyOn(InterestService, "bump").mockResolvedValue(undefined);

    const res = await FeedInteractionService.saveDiscoveryItem(fakeDb, "u", {
      kind: "feed",
      feedItemId: "F1",
    });
    expect(res).toEqual({ saved: true });
    expect(insertSaved).toHaveBeenCalledTimes(1);
    expect(bump).toHaveBeenCalledWith(fakeDb, "u", ["ml"], 1);
  });

  test("sudah saved → idempotent (tanpa insert ganda)", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow());
    spyOn(FeedInteractionRepo, "findSaved").mockResolvedValue({ id: "s1" } as never);
    const insertSaved = spyOn(FeedInteractionRepo, "insertSaved").mockResolvedValue(undefined);
    const res = await FeedInteractionService.saveDiscoveryItem(fakeDb, "u", {
      kind: "feed",
      feedItemId: "F1",
    });
    expect(res).toEqual({ saved: true });
    expect(insertSaved).not.toHaveBeenCalled();
  });
});

describe("FeedInteractionService.saveDiscoveryItem (paper ref)", () => {
  test("paper belum materialize → materialize sekali via cache + save", async () => {
    // resolve: findByDedupeKey paper:K → null → cache hit → upsert → row baru "NEW"
    spyOn(FeedRepo, "findByDedupeKey").mockResolvedValue(null);
    spyOn(PaperCacheService, "getByKey").mockResolvedValue({
      key: "doi:10.1/x",
      title: "Paper",
      snippet: "snip",
      url: "https://x",
      provider: "OpenAlex",
      sourceLabel: "OpenAlex",
      authors: [],
      topics: ["bio"],
      lastSeenAt: 1,
    } as never);
    const upsert = spyOn(FeedRepo, "upsertByDedupeKey").mockResolvedValue(
      feedRow({ id: "NEW", topics: ["bio"], paperKey: "doi:10.1/x" }),
    );
    // topicsOf("NEW") + saveFeedItemForUser path
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow({ id: "NEW", topics: ["bio"] }));
    spyOn(FeedInteractionRepo, "findSaved").mockResolvedValue(null);
    spyOn(FeedInteractionRepo, "insertSaved").mockResolvedValue(undefined);
    spyOn(FeedInteractionRepo, "insertInteraction").mockResolvedValue(undefined);
    const bump = spyOn(InterestService, "bump").mockResolvedValue(undefined);

    const res = await FeedInteractionService.saveDiscoveryItem(fakeDb, "u", {
      kind: "paper",
      paperKey: "doi:10.1/x",
    });
    expect(res).toEqual({ saved: true });
    expect(upsert).toHaveBeenCalledTimes(1); // materialisasi sekali
    expect(bump).toHaveBeenCalledWith(fakeDb, "u", ["bio"], 1);
  });

  test("paper tak ada di cache → saved:false (tak materialize)", async () => {
    spyOn(FeedRepo, "findByDedupeKey").mockResolvedValue(null);
    spyOn(PaperCacheService, "getByKey").mockResolvedValue(null);
    const upsert = spyOn(FeedRepo, "upsertByDedupeKey").mockResolvedValue(feedRow());
    const res = await FeedInteractionService.saveDiscoveryItem(fakeDb, "u", {
      kind: "paper",
      paperKey: "doi:none",
    });
    expect(res).toEqual({ saved: false });
    expect(upsert).not.toHaveBeenCalled();
  });
});

describe("FeedInteractionService hide / research", () => {
  test("hide → hidden + interaction + interest −1", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow({ topics: ["ml"] }));
    const insertHidden = spyOn(FeedInteractionRepo, "insertHidden").mockResolvedValue(undefined);
    spyOn(FeedInteractionRepo, "insertInteraction").mockResolvedValue(undefined);
    const bump = spyOn(InterestService, "bump").mockResolvedValue(undefined);

    const res = await FeedInteractionService.hideDiscoveryItem(fakeDb, "u", {
      kind: "feed",
      feedItemId: "F1",
    });
    expect(res).toEqual({ ok: true });
    expect(insertHidden).toHaveBeenCalledTimes(1);
    expect(bump).toHaveBeenCalledWith(fakeDb, "u", ["ml"], -1);
  });

  test("research interaction → interest +2", async () => {
    spyOn(FeedRepo, "findById").mockResolvedValue(feedRow({ topics: ["climate"] }));
    spyOn(FeedInteractionRepo, "insertInteraction").mockResolvedValue(undefined);
    const bump = spyOn(InterestService, "bump").mockResolvedValue(undefined);

    await FeedInteractionService.recordDiscoveryInteraction(
      fakeDb,
      "u",
      { kind: "feed", feedItemId: "F1" },
      "research",
    );
    expect(bump).toHaveBeenCalledWith(fakeDb, "u", ["climate"], 2);
  });
});
