import {
  ArtifactContentRepo,
  ArtifactEmbeddingRepo,
  ArtifactPaperMetadataRepo,
  ArtifactRepo,
  ArtifactUrlRepo,
  AppError,
  BillingRepo,
  FolderRepo,
  UserRepo,
  WorkspaceRepo,
} from "@aqsha/db";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

const enqueued: Array<{ name: string; data: unknown }> = [];
mock.module("../src/clients/queue", () => ({
  ARTIFACT_QUEUES: {
    urlIngestion: "url-ingestion",
    paperEnrichment: "paper-enrichment",
    artifactCleanup: "artifact-cleanup",
  },
  enqueue: async (name: string, data: unknown) => {
    enqueued.push({ name, data });
  },
}));

const { ArtifactService } = await import("../src/artifact.service");
const { FolderService } = await import("../src/folder.service");
const { StorageService } = await import("../src/storage.service");

const fakeDb = { transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb) } as never;

function makeArtifact(over: Record<string, unknown> = {}) {
  return {
    id: "a",
    ownerUserId: "u",
    workspaceId: "w",
    folderId: null,
    threadId: null,
    artifactType: "markdown",
    artifactFamily: "text",
    source: "manual",
    title: "T",
    language: "markdown",
    mimeType: null,
    fileName: null,
    byteSize: null,
    indexingStatus: "ready",
    indexingFailureReason: null,
    detectedDocumentKind: null,
    storageR2Key: null,
    ragEntryId: null,
    plainTextPreview: "",
    indexedAt: null,
    status: "active",
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as never;
}
function makeWorkspace(over: Record<string, unknown> = {}) {
  return {
    id: "w",
    ownerUserId: "u",
    name: "WS",
    emoji: null,
    description: null,
    status: "active",
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as never;
}
function makeFolder(over: Record<string, unknown> = {}) {
  return {
    id: "f",
    ownerUserId: "u",
    workspaceId: "w",
    name: "F",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...over,
  } as never;
}
function makeContent(over: Record<string, unknown> = {}) {
  return {
    id: "c",
    ownerUserId: "u",
    workspaceId: "w",
    threadId: null,
    artifactId: "a",
    blocksJson: null,
    markdown: "md",
    plainText: "pt",
    contextText: "ctx",
    plainTextR2Key: null,
    blocksJsonR2Key: null,
    markdownR2Key: null,
    createdAt: 1,
    updatedAt: 1,
    ...over,
  } as never;
}

async function appErrorCode(fn: () => unknown): Promise<string> {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AppError);
    return (e as AppError).code;
  }
  throw new Error("expected throw");
}

beforeEach(() => {
  enqueued.length = 0;
  spyOn(WorkspaceRepo, "findById").mockImplementation(async (_db, id) => makeWorkspace({ id }));
  spyOn(FolderRepo, "findById").mockImplementation(async (_db, id) => makeFolder({ id }));
  spyOn(ArtifactRepo, "countActiveByOwner").mockResolvedValue(0);
  spyOn(ArtifactRepo, "insert").mockResolvedValue();
  spyOn(ArtifactRepo, "update").mockResolvedValue();
  spyOn(ArtifactContentRepo, "insert").mockResolvedValue();
  spyOn(ArtifactContentRepo, "updateByArtifact").mockResolvedValue();
  // P5: assertLibraryCapacity kini resolveEffectivePlanKey (db-aware) — stub billing reads.
  spyOn(BillingRepo, "findAdminEntitlement").mockResolvedValue(null);
  spyOn(BillingRepo, "findLatestSubscriptionByOwner").mockResolvedValue(null);
  spyOn(UserRepo, "findByOwnerUserId").mockResolvedValue(null);
  delete process.env.AQSHA_ADMIN_OWNER_USER_IDS;
  delete process.env.AQSHA_ADMIN_EMAILS;
});
afterEach(() => mock.restore());

describe("createDocument", () => {
  test("inserts markdown artifact + empty content, capacity checked", async () => {
    const res = await ArtifactService.createDocument(fakeDb, {
      ownerUserId: "u",
      workspaceId: "w",
      title: "My doc",
    });
    expect(typeof res.artifactId).toBe("string");
    const insertedArtifact = (ArtifactRepo.insert as ReturnType<typeof spyOn>).mock.calls[0]?.[1];
    expect(insertedArtifact).toMatchObject({
      artifactType: "markdown",
      source: "manual",
      indexingStatus: "ready",
      title: "My doc",
      workspaceId: "w",
    });
    expect(ArtifactContentRepo.insert).toHaveBeenCalledTimes(1);
    expect(ArtifactRepo.countActiveByOwner).toHaveBeenCalled();
  });

  test("free plan at cap throws library_item_limit_reached", async () => {
    (ArtifactRepo.countActiveByOwner as ReturnType<typeof spyOn>).mockResolvedValue(25);
    expect(
      await appErrorCode(() =>
        ArtifactService.createDocument(fakeDb, { ownerUserId: "u", workspaceId: "w" }),
      ),
    ).toBe("library_item_limit_reached");
  });
});

describe("get", () => {
  test("returns headless artifact for its owner (thread-attachment reader)", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ workspaceId: null }));
    spyOn(ArtifactContentRepo, "findByArtifact").mockResolvedValue(makeContent());
    const res = await ArtifactService.get(fakeDb, "u", "a");
    expect(res?.artifact._id).toBe("a");
    expect(res?.artifact.workspaceId).toBeNull();
  });
  test("returns null for cross-owner", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ ownerUserId: "other" }));
    expect(await ArtifactService.get(fakeDb, "u", "a")).toBeNull();
  });
  test("shapes artifact + content", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact());
    spyOn(ArtifactContentRepo, "findByArtifact").mockResolvedValue(makeContent());
    const res = await ArtifactService.get(fakeDb, "u", "a");
    expect(res?.artifact._id).toBe("a");
    expect(res?.artifact.storageKey).toBeNull();
    expect(res?.content?.plainText).toBe("pt");
  });
});

describe("getRenderPayload", () => {
  test("markdown returns inline fields", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact());
    spyOn(ArtifactContentRepo, "findByArtifact").mockResolvedValue(
      makeContent({ blocksJson: [{ t: 1 }], markdown: "MD", plainText: "PT" }),
    );
    const r = await ArtifactService.getRenderPayload(fakeDb, "u", "a");
    expect(r).toEqual({
      artifactType: "markdown",
      blocksJson: JSON.stringify([{ t: 1 }]),
      markdown: "MD",
      plainText: "PT",
    });
  });
  test("pdf returns presigned url", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(
      makeArtifact({ artifactType: "pdf", artifactFamily: "file", storageR2Key: "k", fileName: "f.pdf", mimeType: "application/pdf", byteSize: 10, indexingStatus: "ready" }),
    );
    spyOn(StorageService, "getSignedReadUrl").mockResolvedValue("https://signed");
    const r = await ArtifactService.getRenderPayload(fakeDb, "u", "a");
    expect(r).toMatchObject({ artifactType: "pdf", url: "https://signed", fileName: "f.pdf" });
  });
  test("null when not owned/active", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ status: "deleted" }));
    expect(await ArtifactService.getRenderPayload(fakeDb, "u", "a")).toBeNull();
  });
});

describe("updateDocument", () => {
  test("rejects non-markdown", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ artifactType: "pdf" }));
    expect(
      await appErrorCode(() =>
        ArtifactService.updateDocument(fakeDb, { ownerUserId: "u", artifactId: "a", plainText: "x" }),
      ),
    ).toBe("artifact_not_editable_markdown");
  });
  test("offloads oversized plainText to R2 (inline cleared)", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact());
    spyOn(ArtifactContentRepo, "findByArtifact").mockResolvedValue(makeContent());
    spyOn(StorageService, "maybeOffloadText").mockResolvedValue("r2key");
    await ArtifactService.updateDocument(fakeDb, {
      ownerUserId: "u",
      artifactId: "a",
      plainText: "x".repeat(800_000),
    });
    const patch = (ArtifactContentRepo.updateByArtifact as ReturnType<typeof spyOn>).mock.calls[0]?.[2];
    expect(patch.plainText).toBeNull();
    expect(patch.plainTextR2Key).toBe("r2key");
  });
});

describe("update (move) + remove", () => {
  test("cross-workspace move cascades side tables", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ workspaceId: "w" }));
    const c = spyOn(ArtifactContentRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    const u = spyOn(ArtifactUrlRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    const p = spyOn(ArtifactPaperMetadataRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    const e = spyOn(ArtifactEmbeddingRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    await ArtifactService.update(fakeDb, { ownerUserId: "u", artifactId: "a", targetWorkspaceId: "w2" });
    for (const spy of [c, u, p]) {
      expect(spy).toHaveBeenCalledWith(expect.anything(), ["a"], "w2", expect.anything());
    }
    expect(e).toHaveBeenCalledWith(expect.anything(), ["a"], "w2");
  });
  test("remove soft-deletes + enqueues artifact-cleanup", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact());
    await ArtifactService.remove(fakeDb, { ownerUserId: "u", artifactId: "a" });
    const patch = (ArtifactRepo.update as ReturnType<typeof spyOn>).mock.calls.at(-1)?.[2];
    expect(patch.status).toBe("deleted");
    expect(enqueued).toEqual([{ name: "artifact-cleanup", data: { ownerUserId: "u", artifactId: "a" } }]);
  });
});

describe("applyAgentAction (Slice 6.5 born-headless)", () => {
  test("insert artifact + content headless (workspaceId null, source agent, threadId set)", async () => {
    const res = await ArtifactService.applyAgentAction(fakeDb, {
      ownerUserId: "u",
      threadId: "thr1",
      title: "Ringkasan",
      markdown: "# Hi",
    });
    expect(res.artifactType).toBe("markdown");
    const artifact = (ArtifactRepo.insert as ReturnType<typeof spyOn>).mock.calls[0]?.[1];
    expect(artifact).toMatchObject({
      workspaceId: null,
      folderId: null,
      threadId: "thr1",
      source: "agent",
      indexingStatus: "ready",
      status: "active",
    });
    // headless = TIDAK gate kapasitas library (beda dari createDocument)
    expect(ArtifactRepo.countActiveByOwner).not.toHaveBeenCalled();
    const content = (ArtifactContentRepo.insert as ReturnType<typeof spyOn>).mock.calls[0]?.[1];
    expect(content).toMatchObject({ workspaceId: null, threadId: "thr1", markdown: "# Hi" });
  });
});

describe("linkToWorkspace (Slice 6.5 promote headless → workspace)", () => {
  beforeEach(() => {
    spyOn(ArtifactContentRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactUrlRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactPaperMetadataRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactEmbeddingRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
  });

  test("headless artifact → patch workspaceId + cascade 4 side-table", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ workspaceId: null }));
    await ArtifactService.linkToWorkspace(fakeDb, { ownerUserId: "u", artifactId: "a", workspaceId: "w2" });
    const patch = (ArtifactRepo.update as ReturnType<typeof spyOn>).mock.calls.at(-1)?.[2];
    expect(patch.workspaceId).toBe("w2");
    expect(ArtifactContentRepo.setWorkspaceByArtifactIds).toHaveBeenCalledWith(
      expect.anything(),
      ["a"],
      "w2",
      expect.anything(),
    );
    expect(ArtifactEmbeddingRepo.setWorkspaceByArtifactIds).toHaveBeenCalledWith(
      expect.anything(),
      ["a"],
      "w2",
    );
  });

  test("artifact sudah ter-file (workspaceId set) → artifact_already_linked, no patch", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ workspaceId: "w1" }));
    expect(
      await appErrorCode(() =>
        ArtifactService.linkToWorkspace(fakeDb, { ownerUserId: "u", artifactId: "a", workspaceId: "w2" }),
      ),
    ).toBe("artifact_already_linked");
    expect(ArtifactRepo.update).not.toHaveBeenCalled();
  });

  test("cross-owner → artifact_not_found", async () => {
    spyOn(ArtifactRepo, "findById").mockResolvedValue(makeArtifact({ ownerUserId: "other", workspaceId: null }));
    expect(
      await appErrorCode(() =>
        ArtifactService.linkToWorkspace(fakeDb, { ownerUserId: "u", artifactId: "a", workspaceId: "w2" }),
      ),
    ).toBe("artifact_not_found");
  });
});

describe("FolderService P3 seams", () => {
  test("move fans out artifacts + cascades", async () => {
    spyOn(ArtifactRepo, "listActiveIdsByFolder").mockResolvedValue(["a1", "a2"]);
    const setWs = spyOn(ArtifactRepo, "setWorkspaceForFolder").mockResolvedValue();
    spyOn(FolderRepo, "findActiveByName").mockResolvedValue(null);
    spyOn(FolderRepo, "update").mockResolvedValue();
    const cascade = spyOn(ArtifactContentRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactUrlRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactPaperMetadataRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    spyOn(ArtifactEmbeddingRepo, "setWorkspaceByArtifactIds").mockResolvedValue();
    await FolderService.move(fakeDb, { ownerUserId: "u", folderId: "f", targetWorkspaceId: "w2" });
    expect(setWs).toHaveBeenCalledWith(expect.anything(), "u", "f", "w2", expect.anything());
    expect(cascade).toHaveBeenCalledWith(expect.anything(), ["a1", "a2"], "w2", expect.anything());
  });
  test("remove orphans folder artifacts", async () => {
    const clear = spyOn(ArtifactRepo, "clearFolderForFolder").mockResolvedValue();
    spyOn(FolderRepo, "update").mockResolvedValue();
    await FolderService.remove(fakeDb, { ownerUserId: "u", folderId: "f" });
    expect(clear).toHaveBeenCalledWith(expect.anything(), "u", "f", expect.anything());
  });
});
