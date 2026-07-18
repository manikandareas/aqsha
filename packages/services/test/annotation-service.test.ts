/**
 * AnnotationService — DB integration (skip tanpa DATABASE_URL), TANPA toolchain/S3:
 * create butuh build tersimpan (tanpa build → section_build_not_found); build tanpa synctex
 * (synctexR2Key null) → anotasi dibuat dengan source_line null; lifecycle open→sent→
 * dismissed/reopen; guard bibliography. Jalur mapping synctex nyata ada di e2e fase 6.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AppError, createDb, LatexBuildRepo, WorkspaceSectionRepo } from "@aqsha/db";
import { AnnotationService } from "../src/annotation.service";
import { SectionLatexService } from "../src/section-latex.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itan_${SUFFIX}`;
const WS = `itan_${SUFFIX}:ws`;
const SEC = `itan_${SUFFIX}:sec`;
const SEC_BIB = `itan_${SUFFIX}:secbib`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from document_annotations where owner_user_id like 'itan_%'`;
  await client`delete from latex_builds where owner_user_id like 'itan_%'`;
  await client`delete from document_revisions where owner_user_id like 'itan_%'`;
  await client`delete from workspace_sections where workspace_id like 'itan_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itan_%'`;
  await client`delete from artifacts where owner_user_id like 'itan_%'`;
  await client`delete from workspaces where owner_user_id like 'itan_%'`;
  await client`delete from users where owner_user_id like 'itan_%'`;
  await client.end();
});

async function seed(): Promise<void> {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
  await WorkspaceSectionRepo.insertMany(db, [
    { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    { id: SEC_BIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
  ]);
  const saved = await SectionLatexService.saveDocument(db, {
    ownerUserId: OWNER, sectionId: SEC, source: "Baris satu.\nBaris dua.", author: "user",
  });
  if (saved.status !== "saved") throw new Error("seed save gagal");
}

describe("AnnotationService", () => {
  itest("lifecycle penuh + guard build/bibliography", async () => {
    await seed();

    // Tanpa build tersimpan → tidak ada PDF untuk dianotasi.
    await expect(
      AnnotationService.create(db, {
        ownerUserId: OWNER, sectionId: SEC, kind: "pin", page: 1,
        rects: [{ x: 100, y: 200, w: 0, h: 0 }],
      }),
    ).rejects.toThrow(AppError);

    // Build ok tanpa synctex → anotasi dibuat, mapping null.
    await LatexBuildRepo.insert(db, {
      id: `${SEC}:build`, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC,
      status: "ok", pdfR2Key: "k/pdf", synctexR2Key: null, errors: null, logTail: null,
      sourceVersions: { [SEC]: 1 }, builtAt: NOW,
    });
    const a = await AnnotationService.create(db, {
      ownerUserId: OWNER, sectionId: SEC, kind: "highlight", page: 1,
      rects: [{ x: 72, y: 100, w: 200, h: 12 }], selectedText: "Baris satu.", note: "perjelas",
    });
    expect(a.status).toBe("open");
    expect(a.sourceLine).toBeNull();
    expect(a.sourceVersion).toBe(1);

    // Bibliography tidak bisa dianotasi.
    await expect(
      AnnotationService.create(db, {
        ownerUserId: OWNER, sectionId: SEC_BIB, kind: "pin", page: 1,
        rects: [{ x: 0, y: 0, w: 0, h: 0 }],
      }),
    ).rejects.toThrow(AppError);

    // markSent → sent + threadId; update dismissed → dismissed; reopen → open.
    await AnnotationService.markSent(db, {
      ownerUserId: OWNER, sectionId: SEC, ids: [a.id], threadId: "t1",
    });
    let list = await AnnotationService.list(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(list[0]?.status).toBe("sent");
    expect(list[0]?.threadId).toBe("t1");

    const dismissed = await AnnotationService.update(db, {
      ownerUserId: OWNER, sectionId: SEC, annotationId: a.id, status: "dismissed",
    });
    expect(dismissed.status).toBe("dismissed");
    const reopened = await AnnotationService.update(db, {
      ownerUserId: OWNER, sectionId: SEC, annotationId: a.id, status: "open", note: "revisi",
    });
    expect(reopened.status).toBe("open");
    expect(reopened.note).toBe("revisi");

    await AnnotationService.remove(db, { ownerUserId: OWNER, sectionId: SEC, annotationId: a.id });
    list = await AnnotationService.list(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(list.length).toBe(0);

    // Id asing → annotation_not_found.
    await expect(
      AnnotationService.update(db, {
        ownerUserId: OWNER, sectionId: SEC, annotationId: "nope", status: "open",
      }),
    ).rejects.toThrow(AppError);
  });
});
