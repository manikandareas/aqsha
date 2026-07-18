/**
 * LatexBuildService guard-path — DB integration (skip tanpa DATABASE_URL), TANPA
 * toolchain/S3: bab tanpa dokumen → section_document_not_found; section bibliography →
 * bibliography_not_editable; getBuild tanpa build → null. Jalur sukses ada di e2e.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { AppError, createDb, WorkspaceSectionRepo } from "@aqsha/db";
import { LatexBuildService } from "../src/latex/build.service";

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itlb_${SUFFIX}`;
const WS = `itlb_${SUFFIX}:ws`;
const SEC = `itlb_${SUFFIX}:sec`;
const SEC_BIB = `itlb_${SUFFIX}:secbib`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from workspace_sections where workspace_id like 'itlb_%'`;
  await client`delete from workspaces where owner_user_id like 'itlb_%'`;
  await client`delete from users where owner_user_id like 'itlb_%'`;
  await client.end();
});

describe("LatexBuildService guard", () => {
  itest("bab tanpa dokumen → section_document_not_found; bibliography → tolak; build null", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SEC_BIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    await expect(
      LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC }),
    ).rejects.toThrow(AppError);
    await expect(
      LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC_BIB }),
    ).rejects.toThrow(AppError);
    expect(await LatexBuildService.getSectionBuild(db, { ownerUserId: OWNER, sectionId: SEC })).toBeNull();
    expect(
      await LatexBuildService.getWorkspaceBuild(db, { ownerUserId: OWNER, workspaceId: WS }),
    ).toBeNull();
  });
});
