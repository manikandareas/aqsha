/**
 * SectionProposalService — unit applyProposalEdits (pure) + DB integration guard-path
 * TANPA toolchain (propose edit_mismatch tidak menyentuh compile; accept/reject/supersede
 * atas proposal yang di-seed langsung via repo). Jalur dry-run compile nyata = e2e fase 6.
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, SectionEditProposalRepo, WorkspaceSectionRepo } from "@aqsha/db";
import { applyProposalEdits, SectionProposalService } from "../src/latex/section-proposal.service";
import { SectionLatexService } from "../src/section-latex.service";

describe("applyProposalEdits", () => {
  const source = "Baris satu.\nBaris dua.\nBaris satu lagi.";
  test("match unik diterapkan berurutan", () => {
    const out = applyProposalEdits(source, [{ oldText: "Baris dua.", newText: "Baris kedua." }]);
    expect(out).toEqual({ ok: true, source: "Baris satu.\nBaris kedua.\nBaris satu lagi." });
  });
  test("oldText tak ditemukan → not_found dengan index", () => {
    const out = applyProposalEdits(source, [{ oldText: "tidak ada", newText: "x" }]);
    expect(out).toMatchObject({ ok: false, index: 0, reason: "not_found" });
  });
  test("oldText ambigu → ambiguous + jumlah kecocokan", () => {
    const out = applyProposalEdits(source, [{ oldText: "Baris satu", newText: "X" }]);
    expect(out).toMatchObject({ ok: false, reason: "ambiguous", matches: 2 });
  });
});

const DATABASE_URL = process.env.DATABASE_URL;
const itest = DATABASE_URL ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itpr_${SUFFIX}`;
const WS = `itpr_${SUFFIX}:ws`;
const SEC = `itpr_${SUFFIX}:sec`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from section_edit_proposals where owner_user_id like 'itpr_%'`;
  await client`delete from document_annotations where owner_user_id like 'itpr_%'`;
  await client`delete from document_revisions where owner_user_id like 'itpr_%'`;
  await client`delete from workspace_sections where workspace_id like 'itpr_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itpr_%'`;
  await client`delete from artifacts where owner_user_id like 'itpr_%'`;
  await client`delete from workspaces where owner_user_id like 'itpr_%'`;
  await client`delete from users where owner_user_id like 'itpr_%'`;
  await client.end();
});

describe("SectionProposalService accept/reject", () => {
  itest("accept CAS → author agent; stale → superseded; reject → rejected", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Uji"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC, workspaceId: WS, title: "Bab 1", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER, sectionId: SEC, source: "Versi satu.", author: "user",
    });
    if (saved.status !== "saved") throw new Error("seed gagal");

    // Proposal valid atas baseVersion 1 (seed langsung — jalur compile di e2e).
    const pid = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 1, proposedSource: "Versi dua (agen).", summary: "Perbaiki kalimat",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(pending?.id).toBe(pid);
    expect(pending?.isStale).toBe(false);

    const accepted = await SectionProposalService.accept(db, { ownerUserId: OWNER, proposalId: pid });
    expect(accepted).toMatchObject({ status: "accepted", contentVersion: 2 });
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(doc?.source).toBe("Versi dua (agen).");
    const rev = await client`select author from document_revisions
      where owner_user_id = ${OWNER} order by version desc limit 1`;
    expect(rev[0]?.author).toBe("agent");

    // Proposal kedua atas baseVersion basi → accept = stale + superseded.
    const pid2 = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid2, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 1, proposedSource: "Menimpa?", summary: "basi",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    const staleRes = await SectionProposalService.accept(db, { ownerUserId: OWNER, proposalId: pid2 });
    expect(staleRes).toMatchObject({ status: "stale", currentVersion: 2 });
    const row2 = await SectionEditProposalRepo.findById(db, OWNER, pid2);
    expect(row2?.status).toBe("superseded");

    // Reject.
    const pid3 = crypto.randomUUID();
    await SectionEditProposalRepo.insert(db, {
      id: pid3, ownerUserId: OWNER, workspaceId: WS, sectionId: SEC, threadId: null,
      baseVersion: 2, proposedSource: "Versi tiga.", summary: "opsional",
      annotationIds: [], status: "pending", createdAt: NOW, decidedAt: null,
    });
    await SectionProposalService.reject(db, { ownerUserId: OWNER, proposalId: pid3 });
    const row3 = await SectionEditProposalRepo.findById(db, OWNER, pid3);
    expect(row3?.status).toBe("rejected");
  });

  itest("propose edit_mismatch tidak menulis proposal (tanpa compile)", async () => {
    const res = await SectionProposalService.propose(db, {
      ownerUserId: OWNER, sectionId: SEC,
      edits: [{ oldText: "tidak pernah ada", newText: "x" }],
      summary: "salah anchor", enforceRateLimit: false,
    });
    expect(res).toMatchObject({ ok: false, reason: "edit_mismatch" });
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC });
    expect(pending).toBeNull();
  });
});
