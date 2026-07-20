import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Db, throwAppError } from "@aqsha/db";
import { StorageService } from "../storage.service";
import { WorkspaceDocumentService } from "../workspace-document.service";
import { composeProjectBib } from "./project-bib";
import { runSandboxed } from "./runner";

const DEFAULT_TIMEOUT_MS = 60_000;

function pandocBin(): string {
  return process.env.AQSHA_PANDOC_BIN ?? "pandoc";
}

/** Probe ketersediaan pandoc (Bun.spawn melempar bila binary hilang → tangkap jadi false). */
export async function isPandocAvailable(): Promise<boolean> {
  try {
    const run = await runSandboxed([pandocBin(), "--version"], {
      cwd: tmpdir(),
      timeoutMs: 5_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    return !run.timedOut && run.exitCode === 0;
  } catch {
    return false;
  }
}

export type ConvertTypstToDocxInput = {
  source: string;
  bib?: string;
  options?: { timeoutMs?: number };
};

/**
 * Konversi best-effort Typst→DOCX via `pandoc -f typst --citeproc`. Sitasi `@key` +
 * `#bibliography("refs.bib")` dirender jadi daftar pustaka via citeproc (bukan mesin Typst),
 * math→OMML, heading/tabel/footnote terbawa. Batasan: gaya halaman hilang (pakai --reference-doc
 * bila perlu), locator/supplement sitasi drop.
 */
export async function convertTypstToDocx(input: ConvertTypstToDocxInput): Promise<Uint8Array> {
  const workdir = await mkdtemp(join(tmpdir(), "aqsha-typst-docx-"));
  try {
    await writeFile(join(workdir, "main.typ"), input.source, "utf8");
    // Selalu tulis refs.bib (mungkin kosong) supaya --bibliography tak menunjuk file hilang.
    await writeFile(join(workdir, "refs.bib"), input.bib ?? "", "utf8");

    const outPath = join(workdir, "out.docx");
    const args = [
      pandocBin(),
      "main.typ",
      "--from=typst",
      "--to=docx",
      "--citeproc",
      "--bibliography=refs.bib",
      "--output",
      outPath,
    ];

    let run;
    try {
      run = await runSandboxed(args, {
        cwd: workdir,
        timeoutMs: input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
    } catch {
      throwAppError({
        message: "Konverter DOCX (pandoc) tidak tersedia",
        code: "docx_export_unavailable",
        status: 503,
      });
    }
    if (run!.timedOut) {
      throwAppError({
        message: "Ekspor DOCX melebihi batas waktu",
        code: "docx_export_failed",
        status: 500,
      });
    }
    if (run!.exitCode !== 0) {
      throwAppError({
        message: "Ekspor DOCX gagal",
        code: "docx_export_failed",
        status: 500,
      });
    }

    const bytes = await readFile(outPath).catch(() => null);
    if (!bytes || bytes.byteLength === 0) {
      throwAppError({
        message: "Ekspor DOCX selesai tanpa menghasilkan berkas",
        code: "docx_export_failed",
        status: 500,
      });
    }
    return new Uint8Array(bytes);
  } finally {
    await rm(workdir, { recursive: true, force: true });
  }
}

export const WorkspaceDocxExportService = {
  /** Ekspor dokumen penuh → .docx via pandoc; blob StorageService → signed URL. Owner via getDocument. */
  async export(db: Db, input: { ownerUserId: string; workspaceId: string }): Promise<{ url: string }> {
    const doc = await WorkspaceDocumentService.getDocument(db, input);
    if (!doc || !doc.source.trim()) {
      throwAppError({
        message: "Dokumen belum punya isi untuk diekspor",
        code: "document_empty",
        severity: "warning",
        status: 409,
      });
    }
    const bib = await composeProjectBib(db, input);
    const docx = await convertTypstToDocx({ source: doc!.source, bib });
    const key = await StorageService.storeBytes(
      input.ownerUserId,
      input.workspaceId,
      "docx-export",
      docx,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    return { url: await StorageService.getSignedReadUrl(key) };
  },
};
