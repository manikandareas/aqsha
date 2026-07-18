import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { throwAppError } from "@aqsha/db";
import { parseTexLog } from "./log-parser";
import { runSandboxed } from "./runner";
import type { CompileError } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_MEMORY_KB = 2_097_152;
// Kegagalan resolve paket pada mode cache-only muncul sebagai diagnostik tectonic
// di stderr (bukan error TeX di main.log) — sinyal ops, bukan salah dokumen.
const BUNDLE_MISS_PATTERN = /only-cached|cache|bundle|network/i;
const INTERMEDIATE_SUFFIXES = [".aux", ".bbl", ".blg", ".run.xml"];

export type LatexCompileOptions = {
  timeoutMs?: number;
  synctex?: boolean;
  onlyCached?: boolean;
  maxPdfBytes?: number;
};

export type LatexCompileInput = {
  /** Ditulis sebagai main.tex; sitasi harus \addbibresource{refs.bib}. */
  mainTex: string;
  bib?: string;
  extraFiles?: Record<string, Uint8Array>;
  options?: LatexCompileOptions;
};

export type LatexCompileResult =
  | {
      ok: true;
      pdf: Uint8Array;
      synctex: Uint8Array | null;
      log: string;
      /** .aux/.bbl/.blg/.run.xml — untuk verifikasi & debugging loop agen. */
      intermediates: Record<string, string>;
    }
  | { ok: false; errors: CompileError[]; log: string };

async function readBytesIfExists(path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path));
  } catch {
    return null;
  }
}

export const LatexCompileService = {
  async compile(input: LatexCompileInput): Promise<LatexCompileResult> {
    const workdir = await mkdtemp(join(tmpdir(), "aqsha-latex-"));
    try {
      const outdir = join(workdir, "out");
      await mkdir(outdir);
      await writeFile(join(workdir, "main.tex"), input.mainTex, "utf8");
      if (input.bib != null) {
        await writeFile(join(workdir, "refs.bib"), input.bib, "utf8");
      }
      for (const [relPath, bytes] of Object.entries(input.extraFiles ?? {})) {
        const target = resolve(workdir, relPath);
        if (!target.startsWith(workdir + sep)) {
          throwAppError({
            message: "Path file tambahan keluar dari direktori kerja",
            code: "latex_invalid_input",
            field: relPath,
          });
        }
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
      }

      const args = [
        process.env.AQSHA_TECTONIC_BIN ?? "tectonic",
        "--untrusted",
        "--chatter",
        "minimal",
        "--keep-logs",
        "--keep-intermediates",
        "--outdir",
        outdir,
      ];
      if (input.options?.synctex !== false) args.push("--synctex");
      if (input.options?.onlyCached !== false) args.push("--only-cached");
      args.push("main.tex");

      const run = await runSandboxed(args, {
        cwd: workdir,
        timeoutMs: input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxMemoryKb: DEFAULT_MAX_MEMORY_KB,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          TECTONIC_CACHE_DIR: process.env.TECTONIC_CACHE_DIR,
          // Kunci ganda dengan --untrusted: env ini mematikan fitur insecure
          // walau argv suatu saat berubah.
          TECTONIC_UNTRUSTED_MODE: "1",
        },
      });
      if (run.timedOut) {
        throwAppError({
          message: "Kompilasi LaTeX melebihi batas waktu",
          code: "latex_compile_timeout",
          status: 422,
        });
      }

      const logBytes = await readBytesIfExists(join(outdir, "main.log"));
      const log = logBytes
        ? new TextDecoder("utf-8", { fatal: false }).decode(logBytes)
        : `${run.stdout}\n${run.stderr}`;

      if (run.exitCode !== 0) {
        const errors = parseTexLog(log).filter((e) => e.severity === "error");
        if (errors.length > 0) return { ok: false, errors, log };
        if (BUNDLE_MISS_PATTERN.test(run.stderr)) {
          throwAppError({
            message: "Paket LaTeX tidak tersedia di bundle offline",
            code: "latex_bundle_missing",
            status: 503,
          });
        }
        throwAppError({
          message: "Kompilasi LaTeX gagal tanpa error terstruktur",
          code: "latex_compile_failed",
          status: 500,
        });
      }

      const pdf = await readBytesIfExists(join(outdir, "main.pdf"));
      if (!pdf || pdf.byteLength === 0) {
        throwAppError({
          message: "Kompilasi selesai tanpa menghasilkan PDF",
          code: "latex_compile_failed",
          status: 500,
        });
      }
      const maxPdfBytes = input.options?.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
      if (pdf.byteLength > maxPdfBytes) {
        throwAppError({
          message: "PDF hasil kompilasi melebihi batas ukuran",
          code: "latex_output_too_large",
          status: 422,
        });
      }

      const synctex = await readBytesIfExists(join(outdir, "main.synctex.gz"));
      const intermediates: Record<string, string> = {};
      for (const name of await readdir(outdir)) {
        if (INTERMEDIATE_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
          intermediates[name] = await readFile(join(outdir, name), "utf8");
        }
      }
      return { ok: true, pdf, synctex, log, intermediates };
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  },
};
