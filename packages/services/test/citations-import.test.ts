import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import {
  AppError,
  CitationImportBatchRepo,
  CitationRepo,
  DocumentCitationUsageRepo,
  WorkspaceCitationLinkRepo,
} from "@aqsha/db";
import { CitationImportService } from "../src/citations/citation-import.service";
import { CitationService } from "../src/citations/citation.service";
import { WorkspaceService } from "../src/workspace.service";

const fakeDb = { transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fakeDb) } as never;

const OWNER = "user_1";
const WS = "ws_1";

const BIB = `@article{a1,
 title = {Entry Satu},
 author = {Doe, Jane},
 year = {2020},
 journal = {Jurnal A},
 doi = {10.1/dup}
}
@article{a2,
 title = {Entry Dua},
 author = {Roe, Rick},
 year = {2021},
 journal = {Jurnal B}
}
@article{a3,
 title = {Entry Satu Kembar Batch},
 author = {Doe, Jane},
 year = {2020},
 journal = {Jurnal A},
 doi = {10.1/dup}
}
`;

function existingRow(over: Record<string, unknown> = {}) {
  return {
    id: "cit_existing",
    ownerUserId: OWNER,
    artifactId: null,
    source: "import",
    provider: null,
    externalId: null,
    documentType: "article-journal",
    title: "Entry Satu (lama)",
    authorsJson: [{ family: "Doe", given: "Jane" }],
    publishedYear: null,
    venue: null,
    publisher: null,
    doi: "10.1/dup",
    url: null,
    tags: [],
    cslJson: { type: "article-journal", title: "Entry Satu (lama)", DOI: "10.1/dup" },
    canonicalKey: "doi:10.1/dup",
    metadataStatus: "needs_review",
    reviewedAt: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...over,
  } as never;
}

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

function stubOwner() {
  spyOn(WorkspaceService, "assertWorkspaceOwner").mockResolvedValue({} as never);
}

function stubLinks() {
  return spyOn(WorkspaceCitationLinkRepo, "insert").mockResolvedValue();
}

describe("CitationImportService.preview", () => {
  test("tandai duplikat vs library + antar-record batch, persist staging", async () => {
    stubOwner();
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    const insertBatch = spyOn(CitationImportBatchRepo, "insert").mockResolvedValue();

    const preview = await CitationImportService.preview(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fileName: "refs.bib",
      content: BIB,
    });

    expect(preview.format).toBe("bibtex");
    expect(preview.records.length).toBe(3);
    const [r1, r2, r3] = preview.records;
    expect(r1?.duplicateOfId).toBe("cit_existing");
    expect(r2?.duplicateOfId).toBeNull();
    expect(r3?.duplicateOfId).toBe("cit_existing");
    expect(r3?.duplicateInBatch).toBe(true);
    expect(preview.counts).toEqual({ total: 3, valid: 1, incomplete: 0, duplicate: 2, error: 0 });
    expect(insertBatch).toHaveBeenCalledTimes(1);
    const stagedRow = insertBatch.mock.calls[0]?.[1] as { recordsJson: unknown[] };
    expect(stagedRow.recordsJson.length).toBe(3);
  });

  test("file bukan bib/ris → citation_import_invalid", async () => {
    stubOwner();
    expect(
      await appErrorCode(
        CitationImportService.preview(fakeDb, {
          ownerUserId: OWNER,
          workspaceId: WS,
          fileName: "x.txt",
          content: "bukan bibliografi",
        }),
      ),
    ).toBe("citation_import_invalid");
  });
});

describe("CitationImportService.commit", () => {
  async function stagedBatch() {
    stubOwner();
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    let captured: Record<string, unknown> | null = null;
    spyOn(CitationImportBatchRepo, "insert").mockImplementation(async (_db, row) => {
      captured = row as Record<string, unknown>;
    });
    const preview = await CitationImportService.preview(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fileName: "refs.bib",
      content: BIB,
    });
    mock.restore();
    stubOwner();
    // Kolom ber-default DB (status) tidak ada di payload insert — isi manual seperti DB.
    return {
      preview,
      batchRow: { status: "pending", ...(captured as unknown as Record<string, unknown>) },
    };
  }

  test("policy skip: duplikat dilewati, non-duplikat dibuat + ter-link ke proyek", async () => {
    const { preview, batchRow } = await stagedBatch();
    spyOn(CitationImportBatchRepo, "findById").mockResolvedValue(batchRow as never);
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    const insertMany = spyOn(CitationRepo, "insertMany").mockResolvedValue();
    const updateBatch = spyOn(CitationImportBatchRepo, "updateById").mockResolvedValue();
    const insertLink = stubLinks();

    const result = await CitationImportService.commit(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: WS,
      batchId: preview.batchId,
      selectedIndexes: [0, 1, 2],
      duplicatePolicy: "skip",
    });
    expect(result).toEqual({ created: 1, merged: 0, skipped: 2 });
    const rows = insertMany.mock.calls[0]?.[1] as Array<{ title: string; source: string }>;
    expect(rows.map((r) => r.title)).toEqual(["Entry Dua"]);
    expect(rows[0]?.source).toBe("import");
    // Row baru langsung masuk koleksi proyek asal import.
    expect(insertLink).toHaveBeenCalledTimes(1);
    const patch = updateBatch.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.status).toBe("committed");
    expect(patch.recordsJson).toBeNull();
  });

  test("policy merge: patch field kosong existing, duplikat batch tanpa row → skip", async () => {
    const { preview, batchRow } = await stagedBatch();
    spyOn(CitationImportBatchRepo, "findById").mockResolvedValue(batchRow as never);
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    spyOn(CitationRepo, "insertMany").mockResolvedValue();
    const updateCitation = spyOn(CitationRepo, "updateById").mockResolvedValue();
    spyOn(CitationImportBatchRepo, "updateById").mockResolvedValue();
    stubLinks();

    const result = await CitationImportService.commit(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: WS,
      batchId: preview.batchId,
      selectedIndexes: [0, 1, 2],
      duplicatePolicy: "merge",
    });
    // index 0 merge ke existing; index 2 kembar batch (existing sudah dipatch) → merged juga.
    expect(result.created).toBe(1);
    expect(result.merged).toBe(2);
    const patch = updateCitation.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.publishedYear).toBe(2020); // existing null → diisi dari record baru
    expect(patch.venue).toBe("Jurnal A");
  });

  test("policy import: semua terpilih dibuat baru", async () => {
    const { preview, batchRow } = await stagedBatch();
    spyOn(CitationImportBatchRepo, "findById").mockResolvedValue(batchRow as never);
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    const insertMany = spyOn(CitationRepo, "insertMany").mockResolvedValue();
    spyOn(CitationImportBatchRepo, "updateById").mockResolvedValue();
    stubLinks();

    const result = await CitationImportService.commit(fakeDb, {
      ownerUserId: OWNER,
      workspaceId: WS,
      batchId: preview.batchId,
      selectedIndexes: [0, 1, 2],
      duplicatePolicy: "import",
    });
    expect(result).toEqual({ created: 3, merged: 0, skipped: 0 });
    expect((insertMany.mock.calls[0]?.[1] as unknown[]).length).toBe(3);
  });

  test("batch sudah committed → citation_batch_committed", async () => {
    stubOwner();
    spyOn(CitationImportBatchRepo, "findById").mockResolvedValue({
      id: "b1",
      workspaceId: WS,
      status: "committed",
      recordsJson: null,
    } as never);
    expect(
      await appErrorCode(
        CitationImportService.commit(fakeDb, {
          ownerUserId: OWNER,
          workspaceId: WS,
          batchId: "b1",
          selectedIndexes: [0],
          duplicatePolicy: "skip",
        }),
      ),
    ).toBe("citation_batch_committed");
  });

  test("batch workspace lain → citation_batch_not_found", async () => {
    stubOwner();
    spyOn(CitationImportBatchRepo, "findById").mockResolvedValue({
      id: "b1",
      workspaceId: "ws_lain",
      status: "pending",
      recordsJson: [],
    } as never);
    expect(
      await appErrorCode(
        CitationImportService.commit(fakeDb, {
          ownerUserId: OWNER,
          workspaceId: WS,
          batchId: "b1",
          selectedIndexes: [0],
          duplicatePolicy: "skip",
        }),
      ),
    ).toBe("citation_batch_not_found");
  });
});

describe("CitationService guards", () => {
  test("createManual duplikat → citation_duplicate 409; allowDuplicate lolos", async () => {
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([existingRow()]);
    const insert = spyOn(CitationRepo, "insert").mockResolvedValue();
    spyOn(CitationRepo, "findById").mockImplementation(
      async (_db: unknown, _owner: unknown, id: unknown) => existingRow({ id: id as string }) as never,
    );
    // createManual mengembalikan lewat get() → butuh stub usage count.
    spyOn(DocumentCitationUsageRepo, "countDocumentsUsingCitation").mockResolvedValue(0);

    expect(
      await appErrorCode(
        CitationService.createManual(fakeDb, {
          ownerUserId: OWNER,
          fields: { title: "Entry Satu", doi: "10.1/dup" },
        }),
      ),
    ).toBe("citation_duplicate");
    expect(insert).not.toHaveBeenCalled();

    await CitationService.createManual(fakeDb, {
      ownerUserId: OWNER,
      fields: { title: "Entry Satu", doi: "10.1/dup" },
      allowDuplicate: true,
    });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  test("get citation yang sudah dihapus tetap terbaca (allowDeleted)", async () => {
    spyOn(CitationRepo, "findById").mockResolvedValue(existingRow({ deletedAt: 99 }));
    spyOn(DocumentCitationUsageRepo, "countDocumentsUsingCitation").mockResolvedValue(0);
    const detail = await CitationService.get(fakeDb, { ownerUserId: OWNER, citationId: "x" });
    expect(detail.deletedAt).toBe(99);
  });

  test("update citation yang sudah dihapus → citation_not_found", async () => {
    spyOn(CitationRepo, "findById").mockResolvedValue(existingRow({ deletedAt: 99 }));
    expect(
      await appErrorCode(
        CitationService.update(fakeDb, {
          ownerUserId: OWNER,
          citationId: "x",
          tags: ["a"],
        }),
      ),
    ).toBe("citation_not_found");
  });
});
