/**
 * Jalur akun-level: unggah dan pembuatan citation tanpa workspace. Unit murni —
 * repo dan storage di-spy, tak menyentuh Postgres.
 */
import { ArtifactPaperMetadataRepo, ArtifactRepo, CitationRepo } from "@aqsha/db";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { citationCrudMethods } from "../src/citations/citation-crud.methods";

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
