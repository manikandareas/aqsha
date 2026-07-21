/**
 * DocumentProposalService — DB + typst integration (skip tanpa DATABASE_URL / binary typst).
 * Membuktikan: dry-run compile menyaring usulan gagal (compile_error union), anchored edits
 * (edit_mismatch), persist pending tanpa tertimpa, accept penuh/parsial (dry-run subset), stale,
 * reject membuka anotasi.
 */
import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { createDb, DocumentEditProposalRepo } from "@aqsha/db";
import { AnnotationService } from "../src/annotation.service";
import { isTypstAvailable, TypstCompileService } from "../src/typst/compile.service";
import { DocumentProposalService } from "../src/typst/document-proposal.service";
import { applyProposalEdits } from "../src/typst/document-proposal.service";
import { WorkspaceDocumentService } from "../src/workspace-document.service";

const DATABASE_URL = process.env.DATABASE_URL;
const typst = await isTypstAvailable();
const itest = DATABASE_URL && typst ? test : test.skip;
const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `itdp_${SUFFIX}`;
const WS = `itdp_${SUFFIX}:ws`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(DATABASE_URL ?? "postgresql://x");

async function seedWorkspace() {
  await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
    values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
  await client`insert into workspaces (id, owner_user_id, name, kind, status, created_at, updated_at)
    values (${WS}, ${OWNER}, ${"Skripsi Uji"}, ${"undergraduate_thesis"}, ${"active"}, ${NOW}, ${NOW})`;
}

async function resetDoc(source: string): Promise<number> {
  const current = await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS });
  const r = await WorkspaceDocumentService.saveDocument(db, {
    ownerUserId: OWNER,
    workspaceId: WS,
    source,
    ...(current ? { baseVersion: current.contentVersion } : {}),
    author: "user",
  });
  if (r.status !== "saved") throw new Error("reset harus saved");
  return r.contentVersion;
}

async function rejectPendingProposal(): Promise<void> {
  const pending = await DocumentProposalService.getPending(db, {
    ownerUserId: OWNER,
    workspaceId: WS,
  });
  if (pending) await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: pending.id });
}

afterAll(async () => {
  if (!DATABASE_URL) return;
  await client`delete from document_edit_proposals where owner_user_id like 'itdp_%'`;
  await client`delete from document_citation_usages where owner_user_id like 'itdp_%'`;
  await client`delete from document_revisions where owner_user_id like 'itdp_%'`;
  await client`update workspaces set document_artifact_id = null where owner_user_id like 'itdp_%'`;
  await client`delete from artifact_contents where owner_user_id like 'itdp_%'`;
  await client`delete from artifacts where owner_user_id like 'itdp_%'`;
  await client`delete from workspaces where owner_user_id like 'itdp_%'`;
  await client`delete from users where owner_user_id like 'itdp_%'`;
  await client.end();
});

describe("applyProposalEdits (pure)", () => {
  test("match unik → terapkan; tak ketemu / ambigu → union", () => {
    expect(applyProposalEdits("halo dunia", [{ oldText: "dunia", newText: "typst" }])).toEqual({
      ok: true,
      source: "halo typst",
    });
    expect(applyProposalEdits("a a", [{ oldText: "a", newText: "b" }])).toEqual({
      ok: false,
      index: 0,
      reason: "ambiguous",
      matches: 2,
    });
    expect(applyProposalEdits("abc", [{ oldText: "zzz", newText: "x" }])).toEqual({
      ok: false,
      index: 0,
      reason: "not_found",
      matches: 0,
    });
  });
});

describe("DocumentProposalService", () => {
  beforeAll(seedWorkspace);

  itest("propose fullSource valid → pending; getPending mengembalikan view + hunks", async () => {
    await resetDoc("= Pendahuluan\n\nParagraf awal.\n");
    const proposed = "= Pendahuluan\n\nParagraf awal yang direvisi Astra.\n";
    const result = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: proposed,
      summary: "Revisi pembuka",
      enforceRateLimit: false,
    });
    if (!result.ok) throw new Error(`harus ok, dapat ${JSON.stringify(result)}`);
    const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(pending?.proposedSource).toBe(proposed);
    expect(pending?.hunks.length).toBeGreaterThan(0);
    expect(pending?.isStale).toBe(false);
    await rejectPendingProposal();
  });

  itest("proposal pending menyimpan instruksi susun ulang dan menolak proposal kedua", async () => {
    await rejectPendingProposal();
    await resetDoc("= Pendahuluan\n\nVersi awal.\n");
    const first = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Pendahuluan\n\nVersi revisi.\n",
      summary: "Perbaiki pembuka",
      resubmitInstruction: "Perbaiki paragraf pembuka agar lebih jelas.",
      enforceRateLimit: false,
    });
    if (!first.ok) throw new Error("proposal pertama harus tersimpan");

    const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(pending?.resubmitInstruction).toBe("Perbaiki paragraf pembuka agar lebih jelas.");

    const second = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Pendahuluan\n\nVersi lain.\n",
      summary: "Jangan mengganti proposal pertama",
      resubmitInstruction: "Instruksi lain.",
      enforceRateLimit: false,
    });
    expect(second).toEqual({
      ok: false,
      reason: "pending_proposal",
      proposalId: first.proposalId,
      summary: "Perbaiki pembuka",
      isStale: false,
    });

    const row = await DocumentEditProposalRepo.findById(db, OWNER, first.proposalId);
    expect(row?.status).toBe("pending");
    await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: first.proposalId });
  });

  itest("konflik proposal setelah compile menghitung stale dari versi dokumen terbaru", async () => {
    await rejectPendingProposal();
    const initialVersion = await resetDoc("= Pendahuluan\n\nVersi awal.\n");
    const winningProposalId = crypto.randomUUID();
    const compile = spyOn(TypstCompileService, "compile").mockImplementation(async () => {
      const wonRace = await DocumentEditProposalRepo.insertPendingIfAbsent(db, {
        id: winningProposalId,
        ownerUserId: OWNER,
        workspaceId: WS,
        threadId: null,
        baseVersion: initialVersion,
        proposedSource: "= Pendahuluan\n\nProposal pemenang.\n",
        summary: "Proposal pemenang",
        resubmitInstruction: "",
        annotationIds: [],
        status: "pending",
        createdAt: Date.now(),
        decidedAt: null,
      });
      if (!wonRace) throw new Error("proposal pemenang harus tersimpan");

      const saved = await WorkspaceDocumentService.saveDocument(db, {
        ownerUserId: OWNER,
        workspaceId: WS,
        source: "= Pendahuluan\n\nDokumen berubah saat compile.\n",
        baseVersion: initialVersion,
        author: "user",
      });
      if (saved.status !== "saved") throw new Error("perubahan dokumen harus tersimpan");

      return { ok: true, pdf: new Uint8Array([1]) };
    });

    try {
      const result = await DocumentProposalService.propose(db, {
        ownerUserId: OWNER,
        workspaceId: WS,
        fullSource: "= Pendahuluan\n\nKandidat yang kalah.\n",
        summary: "Kandidat kalah",
        enforceRateLimit: false,
      });
      expect(result).toEqual({
        ok: false,
        reason: "pending_proposal",
        proposalId: winningProposalId,
        summary: "Proposal pemenang",
        isStale: true,
      });
    } finally {
      compile.mockRestore();
      await rejectPendingProposal();
    }
  });

  itest("propose sumber yang gagal compile → compile_error union (tak tersimpan)", async () => {
    await rejectPendingProposal();
    const result = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Bab\n\n#undefined_variable_xyz\n",
      summary: "Rusak",
      enforceRateLimit: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("compile_error");
    const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(pending).toBeNull();
  });

  itest("propose edits dengan anchor salah → edit_mismatch", async () => {
    await rejectPendingProposal();
    const result = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      edits: [{ oldText: "kalimat yang tidak ada", newText: "x" }],
      summary: "Anchor salah",
      enforceRateLimit: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("edit_mismatch");
  });

  itest("accept penuh → saved v+1, proposal accepted", async () => {
    await rejectPendingProposal();
    const version = await resetDoc("= Pendahuluan\n\nSatu.\n");
    const proposed = "= Pendahuluan\n\nSatu diperbaiki.\n";
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: proposed,
      summary: "Perbaiki",
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");
    const accepted = await DocumentProposalService.accept(db, {
      ownerUserId: OWNER,
      proposalId: p.proposalId,
      enforceRateLimit: false,
    });
    expect(accepted).toEqual({ status: "accepted", contentVersion: version + 1 });
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(doc?.source).toBe(proposed);
    const row = await DocumentEditProposalRepo.findById(db, OWNER, p.proposalId);
    expect(row?.status).toBe("accepted");
  });

  itest("accept parsial (subset hunk) → dry-run compile → hanya hunk terpilih diterapkan", async () => {
    await rejectPendingProposal();
    // Filler >2×context(3) baris di antara dua perubahan supaya hunk tak menyatu.
    await resetDoc(
      "= Pendahuluan\n\nBaris A.\n\nFiller satu.\n\nFiller dua.\n\nFiller tiga.\n\n= Metode\n\nBaris B.\n",
    );
    const proposed =
      "= Pendahuluan\n\nBaris A diubah.\n\nFiller satu.\n\nFiller dua.\n\nFiller tiga.\n\n= Metode\n\nBaris B diubah.\n";
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: proposed,
      summary: "Dua perubahan",
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");
    const pending = await DocumentProposalService.getPending(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(pending!.hunks.length).toBeGreaterThanOrEqual(2);
    const accepted = await DocumentProposalService.accept(db, {
      ownerUserId: OWNER,
      proposalId: p.proposalId,
      acceptedHunkIndexes: [0],
      enforceRateLimit: false,
    });
    expect(accepted.status).toBe("accepted");
    const doc = await WorkspaceDocumentService.getDocument(db, { ownerUserId: OWNER, workspaceId: WS });
    expect(doc?.source).toContain("Baris A diubah.");
    expect(doc?.source).toContain("Baris B.\n");
    expect(doc?.source).not.toContain("Baris B diubah.");
  });

  itest("accept parsial saat versi bergeser → stale", async () => {
    await rejectPendingProposal();
    const v = await resetDoc("= Bab\n\nAsli.\n");
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Bab\n\nUsulan.\n",
      summary: "x",
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");
    // Geser versi dokumen di belakang proposal.
    await WorkspaceDocumentService.saveDocument(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      source: "= Bab\n\nUser menulis lain.\n",
      baseVersion: v,
      author: "user",
    });
    const accepted = await DocumentProposalService.accept(db, {
      ownerUserId: OWNER,
      proposalId: p.proposalId,
      acceptedHunkIndexes: [0],
      enforceRateLimit: false,
    });
    expect(accepted.status).toBe("stale");
  });

  itest("reject → proposal rejected", async () => {
    await rejectPendingProposal();
    await resetDoc("= Bab\n\nHalo.\n");
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Bab\n\nHalo revisi.\n",
      summary: "y",
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");
    await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: p.proposalId });
    const row = await DocumentEditProposalRepo.findById(db, OWNER, p.proposalId);
    expect(row?.status).toBe("rejected");
  });

  itest("accept tidak menimpa anotasi proposal yang sudah dismissed", async () => {
    await rejectPendingProposal();
    await resetDoc("= Bab\n\nSebelum diterima.\n");
    const annotation = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      kind: "pin",
      page: 1,
      rects: [{ x: 1, y: 1, w: 0, h: 0 }],
    });
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Bab\n\nSesudah diterima.\n",
      summary: "Terima tanpa membuka ulang anotasi",
      respondsToAnnotationIds: [annotation.id],
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");

    await AnnotationService.dismissMany(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      ids: [annotation.id],
    });
    const accepted = await DocumentProposalService.accept(db, {
      ownerUserId: OWNER,
      proposalId: p.proposalId,
      enforceRateLimit: false,
    });

    expect(accepted.status).toBe("accepted");
    const row = (await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS })).find(
      (item) => item.id === annotation.id,
    );
    expect(row?.status).toBe("dismissed");
  });

  itest("reject tidak menimpa anotasi proposal yang sudah dismissed", async () => {
    await rejectPendingProposal();
    await resetDoc("= Bab\n\nSebelum ditolak.\n");
    const annotation = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      kind: "pin",
      page: 1,
      rects: [{ x: 2, y: 2, w: 0, h: 0 }],
    });
    const p = await DocumentProposalService.propose(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      fullSource: "= Bab\n\nSesudah ditolak.\n",
      summary: "Tolak tanpa membuka ulang anotasi",
      respondsToAnnotationIds: [annotation.id],
      enforceRateLimit: false,
    });
    if (!p.ok) throw new Error("propose harus ok");

    await AnnotationService.dismissMany(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
      ids: [annotation.id],
    });
    await DocumentProposalService.reject(db, { ownerUserId: OWNER, proposalId: p.proposalId });

    const row = (await AnnotationService.list(db, { ownerUserId: OWNER, workspaceId: WS })).find(
      (item) => item.id === annotation.id,
    );
    expect(row?.status).toBe("dismissed");
  });
});
