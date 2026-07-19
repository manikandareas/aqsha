import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { throwAppError } from "@aqsha/db";
import { runSandboxed } from "./runner";

const DEFAULT_TIMEOUT_MS = 60_000;

export type DocxConvertInput = {
  /** Ditulis sebagai main.tex; sitasi merujuk refs.bib. */
  mainTex: string;
  bib?: string;
  extraFiles?: Record<string, Uint8Array>;
  options?: { timeoutMs?: number };
};

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

/**
 * Konversi best-effort LaTeX→DOCX via pandoc. Bibliografi dirender pandoc `--citeproc`
 * (bukan biber) sehingga gaya sitasi mendekati, bukan identik dengan compile Tectonic.
 * `.cls` kustom & makro tak dikenal diabaikan pandoc (best-effort).
 */
export async function convertLatexToDocx(input: DocxConvertInput): Promise<Uint8Array> {
  const workdir = await mkdtemp(join(tmpdir(), "aqsha-docx-"));
  try {
    await writeFile(join(workdir, "main.tex"), input.mainTex, "utf8");
    // Selalu tulis refs.bib (mungkin kosong) supaya --bibliography tak menunjuk file hilang.
    await writeFile(join(workdir, "refs.bib"), input.bib ?? "", "utf8");
    for (const [relPath, bytes] of Object.entries(input.extraFiles ?? {})) {
      const target = resolve(workdir, relPath);
      if (!target.startsWith(workdir + sep)) {
        throwAppError({
          message: "Path file tambahan keluar dari direktori kerja",
          code: "docx_invalid_input",
          field: relPath,
        });
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }

    const outPath = join(workdir, "out.docx");
    const args = [
      pandocBin(),
      "main.tex",
      "--from=latex",
      "--to=docx",
      // Rakit daftar pustaka dari sitasi + refs.bib (biber tak dijalankan di jalur ini).
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
      // Bun.spawn melempar bila binary tak ditemukan.
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
