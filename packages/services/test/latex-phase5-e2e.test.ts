/**
 * E2E Fase 5 (gaya gate Fase 4): save 2 bab ber-\cite → compileSection & compileWorkspace
 * → PDF tersimpan + bibliografi ter-render + synctex menunjuk file bab + source_versions
 * terisi. Gated: DATABASE_URL + toolchain tectonic/biber + S3 (MinIO dev).
 */
import { afterAll, describe, expect, test } from "bun:test";
import { createDb, WorkspaceSectionRepo } from "@aqsha/db";
import { PDFDocument } from "pdf-lib";
import { CitationService } from "../src/citations/citation.service";
import { LatexBuildService } from "../src/latex/build.service";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";
import { SectionLatexService } from "../src/section-latex.service";
import { StorageService } from "../src/storage.service";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const hasInfra = Boolean(process.env.DATABASE_URL && process.env.S3_BUCKET);
const itest = hasToolchain && hasInfra ? test : test.skip;

const SUFFIX = Math.floor(Math.random() * 1e9);
const OWNER = `ite2e_${SUFFIX}`;
const WS = `ite2e_${SUFFIX}:ws`;
const SEC1 = `ite2e_${SUFFIX}:sec1`;
const SEC2 = `ite2e_${SUFFIX}:sec2`;
const SECBIB = `ite2e_${SUFFIX}:secbib`;
const CIT = `ite2e_${SUFFIX}:cit`;
const NOW = 1_700_000_000_000;
const { db, client } = createDb(process.env.DATABASE_URL ?? "postgresql://x");

afterAll(async () => {
  if (!process.env.DATABASE_URL) return;
  await client`delete from latex_builds where owner_user_id like 'ite2e_%'`;
  await client`delete from document_citation_usages where owner_user_id like 'ite2e_%'`;
  await client`delete from document_revisions where owner_user_id like 'ite2e_%'`;
  await client`delete from workspace_citation_links where workspace_id like 'ite2e_%'`;
  await client`delete from workspace_sections where workspace_id like 'ite2e_%'`;
  await client`delete from artifact_contents where owner_user_id like 'ite2e_%'`;
  await client`delete from artifacts where owner_user_id like 'ite2e_%'`;
  await client`delete from citations where owner_user_id like 'ite2e_%'`;
  await client`delete from workspaces where owner_user_id like 'ite2e_%'`;
  await client`delete from users where owner_user_id like 'ite2e_%'`;
  await client.end();
});

describe("fase 5 e2e: sumber → assembly → compile → build tersimpan", () => {
  itest("compileSection & compileWorkspace menghasilkan build ok + synctex ke file bab", async () => {
    await client`insert into users (owner_user_id, clerk_user_id, email, created_at, updated_at)
      values (${OWNER}, ${OWNER}, ${`${OWNER}@test.local`}, ${NOW}, ${NOW})`;
    await client`insert into workspaces (id, owner_user_id, name, kind, stage, status, created_at, updated_at)
      values (${WS}, ${OWNER}, ${"Skripsi E2E"}, ${"undergraduate_thesis"}, ${"writing"}, ${"active"}, ${NOW}, ${NOW})`;
    await WorkspaceSectionRepo.insertMany(db, [
      { id: SEC1, workspaceId: WS, title: "Pendahuluan", sortOrder: 0, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SEC2, workspaceId: WS, title: "Metode", sortOrder: 1, status: "empty", role: null, documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
      { id: SECBIB, workspaceId: WS, title: "Daftar Pustaka", sortOrder: 2, status: "empty", role: "bibliography", documentArtifactId: null, createdAt: NOW, updatedAt: NOW },
    ]);
    await client`insert into citations (id, owner_user_id, source, document_type, title, authors_json, published_year, tags, csl_json, canonical_key, metadata_status, created_at, updated_at)
      values (${CIT}, ${OWNER}, ${"manual"}, ${"book"}, ${"Metode Penelitian"}, ${JSON.stringify([{ family: "Sugiyono" }])}, ${2019}, ${[]}, ${JSON.stringify({ type: "book", title: "Metode Penelitian Kuantitatif", author: [{ family: "Sugiyono" }], issued: { "date-parts": [[2019]] }, publisher: "Alfabeta" })}, ${`ck:${CIT}`}, ${"verified"}, ${NOW}, ${NOW})`;
    await client`insert into workspace_citation_links (id, workspace_id, citation_id, created_at)
      values (${`${WS}:link`}, ${WS}, ${CIT}, ${NOW})`;

    const keys = await CitationService.ensureBibKeys(db, { ownerUserId: OWNER, citationIds: [CIT] });
    const key = keys[CIT]!;
    const s1 = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      source: `Penelitian ini memakai metode kuantitatif \\cite{${key}}.\nBaris kedua bab satu.`,
      author: "user",
    });
    const s2 = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC2,
      source: "Bab metode tanpa sitasi.",
      author: "agent",
    });
    if (s1.status !== "saved" || s2.status !== "saved") throw new Error("save gagal");

    // Per-bab.
    const sectionOutcome = await LatexBuildService.compileSection(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(sectionOutcome.status).toBe("ok");
    const sectionBuild = await LatexBuildService.getSectionBuild(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(sectionBuild?.status).toBe("ok");
    expect(sectionBuild?.sourceVersions).toEqual({ [SEC1]: 1 });
    expect(sectionBuild?.pdfUrl).toBeTruthy();

    // Full-document: 2 bab + bibliografi ter-render.
    const fullOutcome = await LatexBuildService.compileWorkspace(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
    });
    expect(fullOutcome.status).toBe("ok");
    const fullBuild = await LatexBuildService.getWorkspaceBuild(db, {
      ownerUserId: OWNER,
      workspaceId: WS,
    });
    expect(fullBuild?.sourceVersions).toEqual({ [SEC1]: 1, [SEC2]: 1 });

    // PDF valid & >1 halaman (maketitle + 2 bab + bibliografi).
    const row = await client`select pdf_r2_key, synctex_r2_key from latex_builds
      where owner_user_id = ${OWNER} and section_id is null`;
    const pdfBytes = await StorageService.readBytes(row[0]!.pdf_r2_key as string);
    const pdf = await PDFDocument.load(pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);

    // SyncTeX mengatribusi baris ke file bab (kontrak lapisan anotasi).
    const synctexBytes = await StorageService.readBytes(row[0]!.synctex_r2_key as string);
    const data = parseSynctex(synctexBytes);
    const hit = synctexInverseLookup(data, { page: 2, x: 100, y: 200 });
    expect(hit?.file ?? "").toContain("sections/");

    // Build error path: sumber rusak → status error + errors[], pdf lama dipertahankan.
    const broken = await SectionLatexService.saveDocument(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
      source: "\\begin{tabel salah",
      baseVersion: 1,
      author: "agent",
    });
    if (broken.status !== "saved") throw new Error("save v2 gagal");
    const errOutcome = await LatexBuildService.compileSection(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(errOutcome.status).toBe("error");
    if (errOutcome.status === "error") expect(errOutcome.errors.length).toBeGreaterThan(0);
    const afterError = await LatexBuildService.getSectionBuild(db, {
      ownerUserId: OWNER,
      sectionId: SEC1,
    });
    expect(afterError?.status).toBe("error");
    expect(afterError?.pdfUrl).toBeTruthy();
    expect(afterError?.sourceVersions).toEqual({ [SEC1]: 2 });
  }, 180_000);
});
