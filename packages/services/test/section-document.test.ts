import {
  ArtifactContentRepo,
  ArtifactRepo,
  WorkspaceSectionRepo,
} from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";

const { SectionDocumentService, parseClustersJson } = await import(
  "../src/section-document.service"
);
const { SectionService } = await import("../src/section.service");
const { StorageService } = await import("../src/storage.service");
const { CitationUsageService } = await import("../src/citations/citation-usages");

const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;

// Magic bytes only (not a real zip/docx) — extraction is expected to fail gracefully
// and fall back to plainText = null, which every saveDocument path must tolerate.
const DOCX_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);

function makeSection(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    workspaceId: "w1",
    title: "Bab 1",
    sortOrder: 0,
    status: "empty",
    role: null,
    documentArtifactId: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as never;
}

function makeDocArtifact(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    ownerUserId: "u1",
    workspaceId: "w1",
    artifactType: "docx",
    status: "active",
    storageR2Key: "artifacts/u1/a1/docx-x",
    contentVersion: 3,
    ...over,
  } as never;
}

afterEach(() => {
  mock.restore();
});

function spyCommon() {
  spyOn(CitationUsageService, "reconcileClusters").mockResolvedValue(undefined as never);
  spyOn(StorageService, "storeBytes").mockResolvedValue("artifacts/u1/new/docx-key" as never);
  spyOn(StorageService, "overwriteBytes").mockResolvedValue(undefined as never);
}

describe("SectionDocumentService.saveDocument", () => {
  test("save pertama: buat artifact docx, link section, empty→draft, versi 1", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(makeSection());
    const artifactInsert = spyOn(ArtifactRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "insert").mockResolvedValue(undefined as never);
    const sectionUpdate = spyOn(WorkspaceSectionRepo, "update").mockResolvedValue(
      undefined as never,
    );

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error("unreachable");
    expect(result.contentVersion).toBe(1);
    expect(result.sectionStatus).toBe("draft");
    const inserted = artifactInsert.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(inserted.artifactType).toBe("docx");
    expect(inserted.source).toBe("manual");
    expect(inserted.contentVersion).toBe(1);
    const patch = sectionUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.documentArtifactId).toBe(inserted.id);
    expect(patch.status).toBe("draft");
  });

  test("save pertama pada section non-empty TIDAK mengubah status", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "in_review" }),
    );
    spyOn(ArtifactRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "insert").mockResolvedValue(undefined as never);
    const sectionUpdate = spyOn(WorkspaceSectionRepo, "update").mockResolvedValue(
      undefined as never,
    );

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });

    expect(result.status).toBe("saved");
    if (result.status !== "saved") throw new Error("unreachable");
    expect(result.sectionStatus).toBe("in_review");
    const patch = sectionUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect("status" in patch).toBe(false);
  });

  test("save berikutnya versi cocok: overwrite + bump versi", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "draft", documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact());
    const artifactUpdate = spyOn(ArtifactRepo, "update").mockResolvedValue(undefined as never);
    spyOn(ArtifactContentRepo, "updateByArtifact").mockResolvedValue(undefined as never);

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      baseVersion: 3,
      clusters: [],
    });

    expect(result).toMatchObject({ status: "saved", artifactId: "a1", contentVersion: 4 });
    expect(StorageService.overwriteBytes).toHaveBeenCalledWith(
      "artifacts/u1/a1/docx-x",
      DOCX_BYTES,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const patch = artifactUpdate.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.contentVersion).toBe(4);
  });

  test("versi tak cocok → stale_write tanpa menulis apa pun", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ status: "draft", documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact({ contentVersion: 5 }));

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      baseVersion: 3,
      clusters: [],
    });

    expect(result).toEqual({ status: "stale_write", currentVersion: 5 });
    expect(StorageService.overwriteBytes).not.toHaveBeenCalled();
  });

  test("section punya dokumen tapi baseVersion absen → stale_write (client out of sync)", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ documentArtifactId: "a1" }),
    );
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeDocArtifact({ contentVersion: 2 }));

    const result = await SectionDocumentService.saveDocument(fakeDb, {
      ownerUserId: "u1",
      sectionId: "s1",
      bytes: DOCX_BYTES,
      fileName: "Bab 1.docx",
      clusters: [],
    });
    expect(result).toEqual({ status: "stale_write", currentVersion: 2 });
  });

  test("section bibliography ditolak", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(
      makeSection({ role: "bibliography" }),
    );
    await expect(
      SectionDocumentService.saveDocument(fakeDb, {
        ownerUserId: "u1",
        sectionId: "s1",
        bytes: DOCX_BYTES,
        fileName: "x.docx",
        clusters: [],
      }),
    ).rejects.toMatchObject({ code: "bibliography_not_editable" });
  });

  test("bytes melebihi MAX_UPLOAD_BYTES ditolak sebelum menyentuh storage", async () => {
    spyCommon();
    spyOn(SectionService, "assertSectionOwner").mockResolvedValue(makeSection());
    const oversized = new Uint8Array(50 * 1024 * 1024 + 1);
    await expect(
      SectionDocumentService.saveDocument(fakeDb, {
        ownerUserId: "u1",
        sectionId: "s1",
        bytes: oversized,
        fileName: "x.docx",
        clusters: [],
      }),
    ).rejects.toMatchObject({ code: "document_too_large" });
    expect(StorageService.storeBytes).not.toHaveBeenCalled();
  });
});

describe("parseClustersJson", () => {
  test("undefined/kosong → []", () => {
    expect(parseClustersJson(undefined)).toEqual([]);
    expect(parseClustersJson("")).toEqual([]);
  });
  test("shape valid → clusters", () => {
    const raw = JSON.stringify([
      { nodeId: "n1", citationIds: ["c1"], locator: { locator: "3" } },
    ]);
    expect(parseClustersJson(raw)).toEqual([
      { nodeId: "n1", citationIds: ["c1"], locator: { locator: "3" } },
    ]);
  });
  test("JSON rusak / shape salah → throw document_clusters_invalid", () => {
    expect(() => parseClustersJson("{not json")).toThrow();
    expect(() => parseClustersJson(JSON.stringify([{ nope: true }]))).toThrow();
  });
});
