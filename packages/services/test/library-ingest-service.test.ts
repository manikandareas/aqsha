/**
 * Jalur akun-level: unggah dan pembuatan citation tanpa workspace. Unit murni —
 * repo dan storage di-spy, tak menyentuh Postgres.
 */
import { ArtifactPaperMetadataRepo, ArtifactRepo, CitationRepo } from "@aqsha/db";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { citationCrudMethods } from "../src/citations/citation-crud.methods";
import * as queue from "../src/clients/queue";
import { LibraryIngestService } from "../src/library/library-ingest.service";

const OWNER = "user_1";
const ARTIFACT = "art_1";

describe("createFromArtifact akun-level", () => {
  beforeEach(() => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(null);
    spyOn(ArtifactRepo, "findById").mockResolvedValue({
      id: ARTIFACT,
      ownerUserId: OWNER,
      workspaceId: null,
      title: "makalah-metodologi.pdf",
      status: "active",
    } as never);
    spyOn(CitationRepo, "insert").mockResolvedValue(undefined as never);
    spyOn(CitationRepo, "findById").mockResolvedValue(null as never);
    spyOn(CitationRepo, "findActiveByArtifact").mockResolvedValue(null as never);
    spyOn(CitationRepo, "findActiveByCanonicalKeys").mockResolvedValue([] as never);
  });

  test("tanpa metadata paper, judul artifact dipakai sebagai placeholder", async () => {
    const inserted: Array<{ title: string }> = [];
    (CitationRepo.insert as ReturnType<typeof spyOn>).mockImplementation(
      async (_db: unknown, row: { title: string }) => {
        inserted.push(row);
      },
    );
    await citationCrudMethods
      .createFromArtifact({} as never, { ownerUserId: OWNER, artifactId: ARTIFACT })
      .catch(() => {});
    expect(inserted[0]?.title).toBe("makalah-metodologi.pdf");
  });
});

describe("gerbang enqueue", () => {
  // `removeJob` menyentuh Redis; unit test hanya peduli pada apa yang di-enqueue.
  beforeEach(() => {
    spyOn(queue, "removeJob").mockResolvedValue(undefined as never);
  });

  test("satu job per citation dengan jobId stabil", async () => {
    const calls: Array<{ name: string; data: unknown; opts?: { jobId?: string } }> = [];
    spyOn(queue, "enqueue").mockImplementation(
      async (name: string, data: Record<string, unknown>, opts?: { jobId?: string }) => {
        calls.push({ name, data, opts });
        return "job";
      },
    );
    await LibraryIngestService.enqueue({ ownerUserId: OWNER, citationIds: ["c1", "c2"] });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.name).toBe("library-ingest");
    expect(calls[0]?.opts?.jobId).toBe("library-ingest:c1");
    expect(calls[1]?.data).toEqual({ ownerUserId: OWNER, citationId: "c2" });
  });

  test("daftar kosong tidak menyentuh antrean", async () => {
    const spy = spyOn(queue, "enqueue").mockResolvedValue("job" as never);
    // `spyOn` atas properti yang sudah di-spy mengembalikan mock yang sama, jadi
    // riwayat panggilan uji sebelumnya masih menempel.
    spy.mockClear();
    await LibraryIngestService.enqueue({ ownerUserId: OWNER, citationIds: [] });
    expect(spy).not.toHaveBeenCalled();
  });
});
