import { ArtifactEmbeddingRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { extractStoredDocument } from "../src/artifacts/extract";

let embeddingEnabled = true;
mock.module("../src/clients/embeddings", () => ({
  embedTexts: async (values: string[]) => values.map(() => [0.1, 0.2, 0.3]),
  isEmbeddingEnabled: () => embeddingEnabled,
  EMBEDDING_MODEL: "text-embedding-3-small",
  EMBEDDING_DIMENSION: 1536,
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

  test("match → skor = 1 - distance/2 (clamp ≥0), limit clamp 20, threadId di-scope", async () => {
    spyOn(ArtifactEmbeddingRepo, "searchSimilar").mockResolvedValue([
      { artifactId: "a", title: "T", chunkIndex: 0, content: "isi", distance: 0.5 },
      { artifactId: "b", title: "T2", chunkIndex: 1, content: "isi2", distance: 3 }, // >2 → clamp 0
    ] as never);
    const r = await RagService.searchThreadDocuments({} as never, {
      ownerUserId: "u",
      threadId: "t1",
      query: "x",
      limit: 999,
    });
    expect(r[0]?.score).toBeCloseTo(0.75);
    expect(r[1]?.score).toBe(0);
    const args = (ArtifactEmbeddingRepo.searchSimilar as ReturnType<typeof spyOn>).mock.calls[0]?.[1];
    expect(args.limit).toBe(20);
    expect(args.threadId).toBe("t1");
  });
});
