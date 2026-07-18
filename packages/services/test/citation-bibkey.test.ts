/**
 * bib_key persisten — DB integration (skip tanpa DATABASE_URL). Membuktikan:
 * assign lazy sekali → beku; penambahan library TIDAK menggeser kunci lama;
 * tabrakan penulis+tahun → suffix; exportBib memakai kunci tersimpan.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, CitationRepo } from "@aqsha/db";
import { CitationService } from "../src/citations/citation.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itbk_${SUFFIX}`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

function cit(id: string, family: string, year: number) {
  return {
    id: `${OWNER}:${id}`,
    ownerUserId: OWNER,
    artifactId: null,
    source: "manual" as const,
    provider: null,
    externalId: null,
    documentType: "book",
    title: `Judul ${id}`,
    authorsJson: [{ family }],
    publishedYear: year,
    venue: null,
    publisher: null,
    doi: null,
    url: null,
    tags: [],
    cslJson: { type: "book", title: `Judul ${id}`, author: [{ family }], issued: { "date-parts": [[year]] } },
    canonicalKey: `ck:${id}`,
    bibKey: null,
    metadataStatus: "verified" as const,
    reviewedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    deletedAt: null,
  };
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from citations where owner_user_id like 'itbk_%'`;
  await client`delete from users where owner_user_id like 'itbk_%'`;
  await client.end();
});

describe("CitationService.ensureBibKeys", () => {
  itest("assign lazy sekali, beku, tabrakan ber-suffix, export pakai kunci tersimpan", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await CitationRepo.insert(db, cit("c1", "Sugiyono", 2019));
    const first = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`],
    });
    expect(first[`${OWNER}:c1`]).toBe("sugiyono2019");

    // Item baru penulis+tahun sama → suffix; kunci lama TIDAK berubah.
    await CitationRepo.insert(db, cit("c2", "Sugiyono", 2019));
    const second = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`, `${OWNER}:c2`],
    });
    expect(second[`${OWNER}:c1`]).toBe("sugiyono2019");
    expect(second[`${OWNER}:c2`]).toBe("sugiyono2019a");

    // Idempoten: panggilan ulang mengembalikan kunci sama tanpa menulis ulang.
    const third = await CitationService.ensureBibKeys(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c2`],
    });
    expect(third[`${OWNER}:c2`]).toBe("sugiyono2019a");

    const exported = await CitationService.exportBib(db, {
      ownerUserId: OWNER,
      citationIds: [`${OWNER}:c1`, `${OWNER}:c2`],
    });
    expect(exported.bib).toContain("@");
    expect(exported.keyById[`${OWNER}:c1`]).toBe("sugiyono2019");
    expect(exported.keyById[`${OWNER}:c2`]).toBe("sugiyono2019a");
  });
});
