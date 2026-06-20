import { ArtifactPaperMetadataRepo } from "@aqsha/db";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { PaperMetadataService } from "../src/paper-metadata.service";

const fakeDb = {} as never;

function makeMeta(over: Record<string, unknown> = {}) {
  return {
    id: "m1",
    ownerUserId: "u",
    artifactId: "a",
    workspaceId: "w",
    metadataSource: "llm",
    title: "Old",
    ...over,
  } as never;
}

afterEach(() => mock.restore());

describe("PaperMetadataService.upsert — monotonic rank", () => {
  test("no existing → insert with array defaults", async () => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(null as never);
    const ins = spyOn(ArtifactPaperMetadataRepo, "insert").mockResolvedValue();
    await PaperMetadataService.upsert(fakeDb, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      metadataSource: "crossref",
      title: "New",
    });
    const row = ins.mock.calls[0]?.[1] as { authors: unknown[]; affiliations: unknown[] };
    expect(row.authors).toEqual([]);
    expect(row.affiliations).toEqual([]);
  });

  test("resolver (2) over llm (1) → updates", async () => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(
      makeMeta({ metadataSource: "llm" }),
    );
    const upd = spyOn(ArtifactPaperMetadataRepo, "updateById").mockResolvedValue();
    await PaperMetadataService.upsert(fakeDb, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      metadataSource: "openalex",
      title: "Better",
    });
    expect(upd).toHaveBeenCalledTimes(1);
    expect((upd.mock.calls[0]?.[2] as { title: string }).title).toBe("Better");
  });

  test("llm (1) over crossref (2) → no-op (no downgrade)", async () => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(
      makeMeta({ metadataSource: "crossref" }),
    );
    const upd = spyOn(ArtifactPaperMetadataRepo, "updateById").mockResolvedValue();
    const ins = spyOn(ArtifactPaperMetadataRepo, "insert").mockResolvedValue();
    await PaperMetadataService.upsert(fakeDb, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      metadataSource: "llm",
      title: "Weaker",
    });
    expect(upd).not.toHaveBeenCalled();
    expect(ins).not.toHaveBeenCalled();
  });

  test("field-merge: only supplied keys patched", async () => {
    spyOn(ArtifactPaperMetadataRepo, "findByArtifact").mockResolvedValue(
      makeMeta({ metadataSource: "openalex" }),
    );
    const upd = spyOn(ArtifactPaperMetadataRepo, "updateById").mockResolvedValue();
    await PaperMetadataService.upsert(fakeDb, {
      ownerUserId: "u",
      artifactId: "a",
      workspaceId: "w",
      metadataSource: "crossref",
      abstract: "abs only",
    });
    const patch = upd.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(patch.abstract).toBe("abs only");
    expect("title" in patch).toBe(false); // tak disuplai → tak di-patch
  });
});
