/**
 * E2E Fase 6 (gaya gate): compileSection → build ok → anotasi ter-map SyncTeX ke file bab →
 * forward lookup → loop proposal (edit_mismatch, compile_error TIDAK menyentuh build resmi,
 * usulan valid → accept CAS author agent + anotasi resolved + recompile ok). Gated:
 * DATABASE_URL + toolchain tectonic/biber + S3 (MinIO dev).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, LatexBuildRepo, WorkspaceSectionRepo } from "@aqsha/db";
import { AnnotationService } from "../src/annotation.service";
import { CitationService } from "../src/citations/citation.service";
import { sectionFilePath } from "../src/latex/assembly.service";
import { LatexBuildService } from "../src/latex/build.service";
import { SectionProposalService } from "../src/latex/section-proposal.service";
import { parseSynctex, spToPdfPoint, synctexForwardLookup } from "../src/latex/synctex";
import { SectionLatexService } from "../src/section-latex.service";
import { StorageService } from "../src/storage.service";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const hasInfra = Boolean(process.env.DATABASE_URL && process.env.S3_BUCKET);
const itest = hasToolchain && hasInfra ? test : test.skip;

const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `it6e2e_${SUFFIX}`;
const WS = `it6e2e_${SUFFIX}:ws`;
const SEC1 = `it6e2e_${SUFFIX}:sec1`;
const SECBIB = `it6e2e_${SUFFIX}:secbib`;
const CIT = `it6e2e_${SUFFIX}:cit`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(process.env.DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await client`delete from section_edit_proposals where owner_user_id like 'it6e2e_%'`;
  await client`delete from document_annotations where owner_user_id like 'it6e2e_%'`;
  await client`delete from latex_builds where owner_user_id like 'it6e2e_%'`;
  await client`delete from document_citation_usages where owner_user_id like 'it6e2e_%'`;
  await client`delete from document_revisions where owner_user_id like 'it6e2e_%'`;
  await client`delete from workspace_citation_links where workspace_id like 'it6e2e_%'`;
  await client`delete from workspace_sections where workspace_id like 'it6e2e_%'`;
  await client`delete from artifact_contents where owner_user_id like 'it6e2e_%'`;
  await client`delete from artifacts where owner_user_id like 'it6e2e_%'`;
  await client`delete from citations where owner_user_id like 'it6e2e_%'`;
  await client`delete from workspaces where owner_user_id like 'it6e2e_%'`;
  await client`delete from users where owner_user_id like 'it6e2e_%'`;
  await client.end();
});

describe("fase 6 e2e: anotasi ter-map + loop proposal accept", () => {
  itest("compile → anotasi SyncTeX → propose gated → accept CAS author agent", async () => {
    // ── Seed ──────────────────────────────────────────────────────────────
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Skripsi F6"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC1, workspaceId: WS, title: "Pendahuluan", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SECBIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 1, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    await client`insert into citations (id, owner_user_id, source, document_type, title, authors_json, published_year, tags, csl_json, canonical_key, metadata_status, created_at, updated_at)
      values (${CIT}, ${OWNER}, ${"manual"}, ${"book"}, ${"Metode Penelitian"}, ${JSON.stringify([{ family: "Sugiyono" }])}, ${2019}, ${[]}, ${JSON.stringify({ type: "book", title: "Metode Penelitian Kuantitatif", author: [{ family: "Sugiyono" }], issued: { "date-parts": [[2019]] }, publisher: "Alfabeta" })}, ${`ck:${CIT}`}, ${"verified"}, ${NOW}, ${NOW})`;
    await client`insert into workspace_citation_links (id, workspace_id, citation_id, created_at)
      values (${`${WS}:link`}, ${WS}, ${CIT}, ${NOW})`;
    const keys = await CitationService.ensureBibKeys(db, { ownerUserId: OWNER, citationIds: [CIT] });
    const key = keys[CIT]!;

    // ── 1. save → compileSection → build ok ───────────────────────────────
    const EDIT_LINE = "Baris kedua yang akan disunting oleh agen.";
    const saved = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      source: `Penelitian ini memakai metode kuantitatif \\cite{${key}}.\n${EDIT_LINE}\nBaris ketiga penutup bab.`,
      author: "user",
    });
    if (saved.status !== "saved") throw new Error("seed save gagal");
    const outcome = await LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC1 });
    expect(outcome.status).toBe("ok");
    const build = await LatexBuildRepo.findBySection(db, OWNER, SEC1);
    expect(build?.synctexR2Key).toBeTruthy();

    // ── 2. anotasi dari koordinat record file bab → ter-map SyncTeX ────────
    const bodyPath = sectionFilePath(SEC1);
    const synctexBytes = await StorageService.readBytes(build!.synctexR2Key as string);
    const data = parseSynctex(synctexBytes);
    const unit = data.unit || 1;
    const bodyRecord = data.records.find((r) => data.inputs.get(r.tag)?.endsWith(bodyPath));
    expect(bodyRecord).toBeDefined();
    const xPt = spToPdfPoint(bodyRecord!.x * unit);
    const yPt = spToPdfPoint(bodyRecord!.y * unit);
    const annotation = await AnnotationService.create(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      kind: "highlight",
      page: bodyRecord!.page,
      rects: [{ x: xPt - 1, y: yPt - 1, w: 2, h: 2 }],
      selectedText: EDIT_LINE,
      note: "perjelas kalimat ini",
    });
    expect(annotation.sourceFile).toBe(bodyPath);
    expect(annotation.sourceLine).not.toBeNull();
    expect(Math.abs((annotation.sourceLine ?? -99) - bodyRecord!.line)).toBeLessThanOrEqual(2);

    // ── 3. forward lookup (file, baris) → halaman yang sama ────────────────
    const forward = synctexForwardLookup(data, { file: bodyPath, line: annotation.sourceLine! });
    expect(forward).not.toBeNull();
    expect(forward?.page).toBe(bodyRecord!.page);

    // ── 4a. propose edits salah anchor → edit_mismatch, tak menulis proposal ─
    const mismatch = await SectionProposalService.propose(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      edits: [{ oldText: "kalimat yang tidak pernah ada", newText: "x" }],
      summary: "anchor salah",
      enforceRateLimit: false,
    });
    expect(mismatch).toMatchObject({ ok: false, reason: "edit_mismatch" });
    expect(await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC1 })).toBeNull();

    // ── 4b. propose fullSource LaTeX rusak → compile_error, build resmi UTUH ─
    const builtAtBefore = build!.builtAt;
    const compileErr = await SectionProposalService.propose(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      fullSource: "\\begin{itemize}\nItem tanpa penutup.",
      summary: "sengaja rusak",
      enforceRateLimit: false,
    });
    expect(compileErr).toMatchObject({ ok: false, reason: "compile_error" });
    if (compileErr.ok === false && compileErr.reason === "compile_error") {
      expect(compileErr.compileErrors.length).toBeGreaterThan(0);
    }
    const buildAfterErr = await LatexBuildRepo.findBySection(db, OWNER, SEC1);
    expect(buildAfterErr?.builtAt).toBe(builtAtBefore);
    expect(await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC1 })).toBeNull();

    // ── 5. propose valid → ok:true, pending tidak basi ────────────────────
    const valid = await SectionProposalService.propose(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      edits: [{ oldText: EDIT_LINE, newText: "Baris kedua yang sudah disunting oleh agen." }],
      summary: "Perjelas kalimat kedua",
      respondsToAnnotationIds: [annotation.id],
      enforceRateLimit: false,
    });
    expect(valid.ok).toBe(true);
    const pending = await SectionProposalService.getPending(db, { ownerUserId: OWNER, sectionId: SEC1 });
    expect(pending?.isStale).toBe(false);
    expect(pending?.annotationIds).toEqual([annotation.id]);

    // ── 6. accept → author agent + anotasi resolved + recompile ok ─────────
    if (!valid.ok) throw new Error("proposal valid tak menghasilkan id");
    const accepted = await SectionProposalService.accept(db, { ownerUserId: OWNER, proposalId: valid.proposalId });
    expect(accepted).toMatchObject({ status: "accepted", contentVersion: 2 });
    const doc = await SectionLatexService.getDocument(db, { ownerUserId: OWNER, sectionId: SEC1 });
    expect(doc?.source).toContain("Baris kedua yang sudah disunting oleh agen.");
    const rev = await client`select author from document_revisions
      where owner_user_id = ${OWNER} order by version desc limit 1`;
    expect(rev[0]?.author).toBe("agent");
    const list = await AnnotationService.list(db, { ownerUserId: OWNER, sectionId: SEC1 });
    expect(list.find((a) => a.id === annotation.id)?.status).toBe("resolved");
    const recompiled = await LatexBuildService.compileSection(db, { ownerUserId: OWNER, sectionId: SEC1 });
    expect(recompiled.status).toBe("ok");
  }, 180_000);
});
