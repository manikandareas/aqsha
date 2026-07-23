import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  AppError,
  CitationRepo,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import { CitationLinkService } from "../src/citations/citation-link.service";
import { CitationService } from "../src/citations/citation.service";
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

const listItem = {
  id: "cit_1",
  documentType: "article-journal",
  title: "Alpha",
  authors: [{ family: "Sari", given: "Dewi" }],
  publishedYear: 2024,
  venue: "Jurnal",
  doi: null,
  url: null,
  tags: ["metode"],
  source: "manual",
  metadataStatus: "verified",
  artifactId: null,
  updatedAt: 2,
};

async function appErrorCode(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    throw new Error("expected throw");
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
}

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

describe("CitationLinkService.listCandidates", () => {
  test("marks page membership with linked flags", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    spyOn(CitationService, "list").mockResolvedValue({
      items: [listItem as never],
      nextCursor: null,
      total: 1,
    });
    spyOn(WorkspaceCitationLinkRepo, "listLinkedCitationIds").mockResolvedValue(["cit_1"]);

    expect(
      await CitationLinkService.listCandidates(db, {
        ownerUserId: "user_1",
        workspaceId: "ws_1",
        limit: 20,
      }),
    ).toEqual({
      items: [expect.objectContaining({ id: "cit_1", linked: true })],
      nextCursor: null,
      total: 1,
    });
  });
});

describe("CitationLinkService.getForWorkspace", () => {
  test("rejects unlinked citation with citation_not_in_workspace", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    spyOn(WorkspaceCitationLinkRepo, "exists").mockResolvedValue(false);

    expect(
      await appErrorCode(
        CitationLinkService.getForWorkspace(db, {
          ownerUserId: "user_1",
          workspaceId: "ws_1",
          citationId: "cit_1",
        }),
      ),
    ).toBe("citation_not_in_workspace");
  });
});

describe("CitationLinkService.removeManyFromWorkspace", () => {
  test("bulk unlinks without deleting canonical rows", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    const del = spyOn(WorkspaceCitationLinkRepo, "deleteManyByWorkspaceAndCitationIds").mockResolvedValue(
      2,
    );
    const soft = spyOn(CitationRepo, "softDeleteMany");

    expect(
      await CitationLinkService.removeManyFromWorkspace(db, {
        ownerUserId: "user_1",
        workspaceId: "ws_1",
        citationIds: ["cit_1", "cit_2"],
      }),
    ).toEqual({ affected: 2 });
    expect(del).toHaveBeenCalledWith(db, "ws_1", ["cit_1", "cit_2"]);
    expect(soft).not.toHaveBeenCalled();
  });
});

describe("CitationLinkService.exportForWorkspace", () => {
  test("rejects ids outside membership", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    spyOn(WorkspaceCitationLinkRepo, "listLinkedCitationIds").mockResolvedValue(["cit_1"]);

    expect(
      await appErrorCode(
        CitationLinkService.exportForWorkspace(db, {
          ownerUserId: "user_1",
          workspaceId: "ws_1",
          format: "bibtex",
          citationIds: ["cit_1", "cit_forged"],
        }),
      ),
    ).toBe("citation_not_in_workspace");
  });

  test("exports only linked rows when ids omitted", async () => {
    spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({ id: "ws_1" } as never);
    spyOn(CitationRepo, "listAllActiveByWorkspace").mockResolvedValue([row]);
    const exp = spyOn(CitationService, "export").mockResolvedValue({
      content: "@article{a}",
      mimeType: "application/x-bibtex",
      filename: "sitasi.bib",
    });

    const result = await CitationLinkService.exportForWorkspace(db, {
      ownerUserId: "user_1",
      workspaceId: "ws_1",
      format: "bibtex",
    });

    expect(exp).toHaveBeenCalledWith(db, {
      ownerUserId: "user_1",
      format: "bibtex",
      citationIds: ["cit_1"],
    });
    expect(result.filename).toBe("sitasi.bib");
  });
});
