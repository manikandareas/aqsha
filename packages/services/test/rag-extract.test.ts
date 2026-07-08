import { ArtifactEmbeddingRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { extractStoredDocument } from "../src/artifacts/extract";

let embeddingEnabled = true;
// Spread modul asli supaya mock EXPORT-COMPLETE by construction: mock.module MENGGANTI seluruh
// modul, export yang hilang = SyntaxError saat import (dan bocor ke file test lain) — export baru
// di clients/embeddings otomatis ikut tanpa harus menambal daftar ini lagi.
const actualEmbeddings = await import("../src/clients/embeddings");
mock.module("../src/clients/embeddings", () => ({
  ...actualEmbeddings,
  embedTexts: async (values: string[]) => values.map(() => [0.1, 0.2, 0.3]),
  isEmbeddingEnabled: () => embeddingEnabled,
  // Override tetap perlu: versi asli membaca kredensial env, test mengontrol via flag lokal.
  assertEmbeddingEnabled: () => {
    if (!embeddingEnabled) throw new Error("embedding disabled (mock)");
  },
}));

const { RagService, ragEntryIdFor } = await import("../src/rag.service");

afterEach(() => mock.restore());

describe("extractStoredDocument", () => {
  test("utf8 text normalizes newlines", async () => {
    const bytes = new TextEncoder().encode("hello\r\nworld");
    const r = await extractStoredDocument(bytes, "a.txt", "text/plain");
    expect(r.plainText).toBe("hello\nworld");
    expect(r.markdown).toBe("hello\nworld");
  });

  test("html strips tags + script in plainText, markdown keeps raw", async () => {
    const bytes = new TextEncoder().encode("<p>Hi <b>there</b></p><script>danger()</script>");
    const r = await extractStoredDocument(bytes, "a.html", "text/html");
    expect(r.plainText).toContain("Hi");
    expect(r.plainText).toContain("there");
    expect(r.plainText).not.toContain("danger()");
    expect(r.markdown).toContain("<p>");
  });
});

describe("RagService.index", () => {
  test("disabled embedding → null, no writes", async () => {
    embeddingEnabled = false;
    const del = spyOn(ArtifactEmbeddingRepo, "deleteByArtifact").mockResolvedValue();
    const ins = spyOn(ArtifactEmbeddingRepo, "insertMany").mockResolvedValue();
    const id = await RagService.index({} as never, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      text: "x".repeat(5000),
    });
    expect(id).toBeNull();
    expect(del).not.toHaveBeenCalled();
    expect(ins).not.toHaveBeenCalled();
    embeddingEnabled = true;
  });

  test("chunks text, re-index clears old, returns ragEntryId", async () => {
    const del = spyOn(ArtifactEmbeddingRepo, "deleteByArtifact").mockResolvedValue();
    const ins = spyOn(ArtifactEmbeddingRepo, "insertMany").mockResolvedValue();
    const id = await RagService.index({} as never, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      text: "x".repeat(5000),
    });
    expect(id).toBe(ragEntryIdFor("a"));
    expect(del).toHaveBeenCalledTimes(1);
    const rows = ins.mock.calls[0]?.[1] as Array<{ chunkIndex: number; artifactId: string }>;
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0]?.chunkIndex).toBe(0);
    expect(rows[0]?.artifactId).toBe("a");
  });
});

describe("RagService.searchThreadDocuments (Slice 6.4 read, degrade-graceful)", () => {
  test("embedding disabled → [] tanpa query repo", async () => {
    embeddingEnabled = false;
    const sim = spyOn(ArtifactEmbeddingRepo, "searchSimilar").mockResolvedValue([] as never);
    const r = await RagService.searchThreadDocuments({} as never, {
      ownerUserId: "u",
      threadId: "t1",
      query: "apa isi dokumen",
    });
    expect(r).toEqual([]);
    expect(sim).not.toHaveBeenCalled();
    embeddingEnabled = true;
  });

  test("query kosong → [] tanpa query repo", async () => {
    const sim = spyOn(ArtifactEmbeddingRepo, "searchSimilar").mockResolvedValue([] as never);
    expect(
      await RagService.searchThreadDocuments({} as never, { ownerUserId: "u", threadId: "t1", query: "  " }),
    ).toEqual([]);
    expect(sim).not.toHaveBeenCalled();
  });

  test("hybrid (D4): fusi RRF vektor+leksikal — chunk di kedua jalur naik; kandidat + scope", async () => {
    const sim = spyOn(ArtifactEmbeddingRepo, "searchSimilar").mockResolvedValue([
      { artifactId: "a", title: "T", chunkIndex: 0, content: "isi-a", distance: 0.1 }, // vektor rank 0
      { artifactId: "b", title: "T2", chunkIndex: 0, content: "isi-b", distance: 0.4 }, // vektor rank 1
    ] as never);
    const lex = spyOn(ArtifactEmbeddingRepo, "searchLexical").mockResolvedValue([
      { artifactId: "b", title: "T2", chunkIndex: 0, content: "isi-b", rank: 0.9 }, // leksikal rank 0
      { artifactId: "c", title: "T3", chunkIndex: 0, content: "isi-c", rank: 0.5 }, // leksikal rank 1
    ] as never);
    const r = await RagService.searchThreadDocuments({} as never, {
      ownerUserId: "u",
      threadId: "t1",
      query: "x",
      limit: 999,
    });
    // b muncul di vektor (rank 1) DAN leksikal (rank 0) → skor RRF tertinggi → urutan pertama.
    expect(r[0]?.artifactId).toBe("b");
    expect(r.map((m) => m.artifactId).sort()).toEqual(["a", "b", "c"]);
    // Tiap jalur dipanggil dgn limit KANDIDAT (final 20 → kandidat min(60,50)=50) + scope thread.
    const simArgs = sim.mock.calls[0]?.[1];
    const lexArgs = lex.mock.calls[0]?.[1];
    expect(simArgs.limit).toBe(50);
    expect(lexArgs.limit).toBe(50);
    expect(simArgs.threadId).toBe("t1");
    expect(lexArgs.threadId).toBe("t1");
    expect(lexArgs.query).toBe("x");
  });
});
