import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { CitationRepo } from "@aqsha/db";
import { CitationLinkService } from "../src/citations/citation-link.service";
import { WorkspaceService } from "../src/workspace.service";

const db = {} as never;
const row = {
  id: "cit_1",
  ownerUserId: "user_1",
  artifactId: null,
  source: "manual",
  provider: null,
  externalId: null,
  documentType: "article-journal",
  title: "Alpha",
  authorsJson: [{ family: "Sari", given: "Dewi" }],
  publishedYear: 2024,
  venue: "Jurnal",
  publisher: null,
  doi: null,
  url: null,
  tags: ["metode"],
  cslJson: {},
  canonicalKey: "title:alpha",
  metadataStatus: "verified",
  reviewedAt: null,
  createdAt: 1,
  updatedAt: 2,
  deletedAt: null,
} as never;

afterEach(() => mock.restore());

describe("CitationLinkService.listForWorkspace", () => {
  test("authorizes and returns normalized filtered page", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    const list = spyOn(CitationRepo, "listByWorkspace").mockResolvedValue({
      items: [row],
      nextCursor: "next",
    });
    spyOn(CitationRepo, "countActiveByWorkspace").mockResolvedValue(1);

    const result = await CitationLinkService.listForWorkspace(db, {
      ownerUserId: "user_1",
      workspaceId: "ws_1",
      limit: 20,
      cursor: null,
      q: "Alpha",
      status: "verified",
      source: "manual",
      tag: "metode",
    });

    expect(list).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        ownerUserId: "user_1",
        workspaceId: "ws_1",
        limit: 20,
        filters: { q: "Alpha", status: "verified", source: "manual", tag: "metode" },
      }),
    );
    expect(result).toEqual({
      items: [expect.objectContaining({ id: "cit_1", authors: [{ family: "Sari", given: "Dewi" }] })],
      nextCursor: "next",
      total: 1,
    });
  });
});
