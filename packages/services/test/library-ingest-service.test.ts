/**
 * Jalur akun-level: unggah dan pembuatan citation tanpa workspace. Unit murni —
 * repo dan storage di-spy, tak menyentuh Postgres.
 */
import { ArtifactPaperMetadataRepo, ArtifactRepo, CitationRepo } from "@aqsha/db";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { citationCrudMethods } from "../src/citations/citation-crud.methods";
import * as queue from "../src/clients/queue";
import { LibraryIngestService } from "../src/library/library-ingest.service";
import { ArtifactService } from "../src/artifact.service";
import { PaperMetadataService } from "../src/paper-metadata.service";
import * as rateLimits from "../src/quota/rate-limits";

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

describe("state machine", () => {
  test("item tanpa artifact mendapat artifact referensi akun-level", async () => {
    const inserted: Array<{ source: string; workspaceId?: string | null }> = [];
    spyOn(ArtifactRepo, "insert").mockImplementation(
      async (_db: unknown, row: { source: string; workspaceId?: string | null }) => {
        inserted.push(row);
      },
    );
    spyOn(CitationRepo, "updateById").mockResolvedValue(undefined as never);
    const artifactId = await LibraryIngestService.ensureArtifact({} as never, {
      ownerUserId: OWNER,
      citation: {
        id: "c1",
        ownerUserId: OWNER,
        artifactId: null,
        title: "Judul referensi",
        authorsJson: [],
        venue: "Jurnal",
        doi: null,
        url: null,
        cslJson: {},
        deletedAt: null,
      } as never,
    });
    expect(artifactId).toBeTruthy();
    expect(inserted[0]?.source).toBe("reference");
    expect(inserted[0]?.workspaceId).toBeNull();
  });

  test("citation terhapus tidak diproses", async () => {
    spyOn(CitationRepo, "findById").mockResolvedValue({
      id: "c2",
      ownerUserId: OWNER,
      deletedAt: 1,
    } as never);
    const patch = spyOn(CitationRepo, "updateById").mockResolvedValue(undefined as never);
    patch.mockClear();
    await LibraryIngestService.run({} as never, { ownerUserId: OWNER, citationId: "c2" });
    expect(patch).not.toHaveBeenCalled();
  });
});

describe("resolve metadata", () => {
  test("judul turunan nama file diperlakukan sebagai placeholder", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    const citation = {
      id: "c3",
      ownerUserId: OWNER,
      source: "artifact",
      title: "makalah-metodologi.pdf",
      doi: "10.1234/uji",
      venue: null,
      publishedYear: null,
      authorsJson: [],
      cslJson: {},
    };
    await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: citation as never,
      artifactId: "art_3",
      resolve: async () =>
        ({
          title: "Metodologi Penelitian Kualitatif",
          authors: [{ name: "Sari, R." }],
          metadataSource: "crossref",
          affiliations: [],
          pdfCandidates: [],
        }) as never,
    });
    expect(patches[0]?.title).toBe("Metodologi Penelitian Kualitatif");
  });

  test("judul yang diisi pengguna tidak ditimpa", async () => {
    const patches: Array<Record<string, unknown>> = [];
    spyOn(CitationRepo, "updateById").mockImplementation(
      async (_db: unknown, _id: string, patch: Record<string, unknown>) => {
        patches.push(patch);
      },
    );
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: {
        id: "c4",
        ownerUserId: OWNER,
        source: "manual",
        title: "Judul pilihan saya",
        doi: "10.1234/uji",
        venue: null,
        publishedYear: null,
        authorsJson: [],
        cslJson: {},
      } as never,
      artifactId: "art_4",
      resolve: async () =>
        ({
          title: "Judul resmi penerbit",
          authors: [],
          metadataSource: "crossref",
          affiliations: [],
          pdfCandidates: [],
        }) as never,
    });
    expect(patches[0]?.title).toBeUndefined();
  });

  test("resolver gagal tidak melempar", async () => {
    spyOn(PaperMetadataService, "upsert").mockResolvedValue({ ok: true } as never);
    const result = await LibraryIngestService.resolveMetadata({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c5", ownerUserId: OWNER, doi: "10.1/x", cslJson: {} } as never,
      artifactId: "art_5",
      resolve: async () => {
        throw new Error("provider mati");
      },
    });
    expect(result).toBeNull();
  });
});

describe("ambil PDF open access", () => {
  // Limiter memakai Redis; di unit test kita hanya butuh gerbangnya selalu terbuka.
  beforeEach(() => {
    spyOn(rateLimits, "getRateLimiter").mockReturnValue({
      consume: async () => ({}),
    } as never);
  });

  test("tanpa kandidat, tidak mengunduh apa pun", async () => {
    const ingest = spyOn(ArtifactService, "ingestResolvedPdf").mockResolvedValue({
      indexed: true,
    } as never);
    ingest.mockClear();
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c6", ownerUserId: OWNER, title: "Judul" } as never,
      artifactId: "art_6",
      resolved: { pdfCandidates: [], authors: [], affiliations: [] } as never,
    });
    expect(upgraded).toBe(false);
    expect(ingest).not.toHaveBeenCalled();
  });

  test("unduhan gagal bukan kegagalan item", async () => {
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c7", ownerUserId: OWNER, title: "Judul" } as never,
      artifactId: "art_7",
      resolved: {
        pdfCandidates: ["https://contoh.test/a.pdf"],
        authors: [],
        affiliations: [],
      } as never,
      download: async () => {
        throw new Error("jaringan mati");
      },
    });
    expect(upgraded).toBe(false);
  });

  test("unduhan berhasil menaikkan artifact jadi PDF", async () => {
    const ingest = spyOn(ArtifactService, "ingestResolvedPdf").mockResolvedValue({
      indexed: true,
    } as never);
    const upgraded = await LibraryIngestService.fetchOpenAccessPdf({} as never, {
      ownerUserId: OWNER,
      citation: { id: "c8", ownerUserId: OWNER, title: "Judul paper" } as never,
      artifactId: "art_8",
      resolved: {
        pdfCandidates: ["https://contoh.test/a.pdf"],
        authors: [],
        affiliations: [],
      } as never,
      download: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        byteSize: 3,
        sourceUrl: "https://contoh.test/a.pdf",
      }),
    });
    expect(upgraded).toBe(true);
    expect(ingest).toHaveBeenCalled();
  });
});
