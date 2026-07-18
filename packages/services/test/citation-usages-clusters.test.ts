import { CitationRepo, DocumentCitationUsageRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

const { CitationUsageService } = await import("../src/citations/citation-usages");

const fakeDb = {} as never;

afterEach(() => {
  mock.restore();
});

describe("CitationUsageService.reconcileClusters", () => {
  test("menulis usage berurutan hanya untuk citation valid milik owner", async () => {
    spyOn(CitationRepo, "findByIds").mockResolvedValue([{ id: "c1" }, { id: "c2" }] as never);
    const replace = spyOn(DocumentCitationUsageRepo, "replaceForDocument").mockResolvedValue(
      undefined as never,
    );

    await CitationUsageService.reconcileClusters(fakeDb, {
      ownerUserId: "u",
      workspaceId: "w",
      documentArtifactId: "doc",
      clusters: [
        { nodeId: "n1", citationIds: ["c1", "missing"], locator: { locator: "12" } },
        { nodeId: "n2", citationIds: ["c2"], locator: {} },
      ],
    });

    const arg = replace.mock.calls[0]?.[1] as { rows: Array<Record<string, unknown>> };
    expect(arg.rows.map((r) => [r.citationId, r.inlineNodeId, r.occurrenceOrder])).toEqual([
      ["c1", "n1", 0],
      ["c2", "n2", 1],
    ]);
    expect(arg.rows[0]?.locatorJson).toEqual({ locator: "12" });
    expect(arg.rows[1]?.locatorJson).toBeNull();
  });

  test("clusters kosong tetap replace (menghapus usage lama)", async () => {
    const replace = spyOn(DocumentCitationUsageRepo, "replaceForDocument").mockResolvedValue(
      undefined as never,
    );
    await CitationUsageService.reconcileClusters(fakeDb, {
      ownerUserId: "u",
      workspaceId: "w",
      documentArtifactId: "doc",
      clusters: [],
    });
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
