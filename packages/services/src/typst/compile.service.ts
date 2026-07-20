import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { throwAppError } from "@aqsha/db";
import { parseTypstDiagnostics } from "./diagnostics";
import { runSandboxed } from "./runner";
import type { TypstDiagnostic } from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_PDF_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_MEMORY_KB = 2_097_152;

export type TypstCompileInput = {
  /** Ditulis sebagai main.typ; sitasi merujuk `#bibliography("refs.bib")`. */
  mainTyp: string;
  /** Ditulis sebagai refs.bib bila ada (dokumen tanpa sitasi tak perlu). */
  bib?: string;
  options?: { timeoutMs?: number; maxPdfBytes?: number };
};

export type TypstCompileResult =
  | { ok: true; pdf: Uint8Array }
  | { ok: false; errors: TypstDiagnostic[] };

function typstBin(): string {
  return process.env.AQSHA_TYPST_BIN ?? "typst";
}

/** Dir font tambahan (ttf/otf self-host) — CSV/`:`-separated; kosong → hanya font sistem + built-in. */
function fontPathArgs(): string[] {
  const raw = process.env.AQSHA_TYPST_FONT_PATH;
  if (!raw) return [];
  return raw
    .split(/[:,]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => ["--font-path", p]);
}

/** Cache paket `@preview` persisten antar-compile (download sekali; kegagalan network = compile error biasa). */
function cacheDir(): string {
  return process.env.AQSHA_TYPST_CACHE_DIR ?? join(tmpdir(), "aqsha-typst-cache");
}

/** Probe ketersediaan binary typst (Bun.spawn melempar bila hilang → tangkap jadi false). */
export async function isTypstAvailable(): Promise<boolean> {
  try {
    const run = await runSandboxed([typstBin(), "--version"], {
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
 * Compile satu dokumen Typst via CLI `typst` di `runSandboxed`. Dipakai server untuk ekspor PDF
 * dan dry-run validasi proposal Astra (preview realtime pakai WASM di browser, bukan ini).
 * `--root` mengurung akses berkas dokumen ke workdir; `XDG_CACHE_HOME` mengarah dir cache persisten.
 */
export const TypstCompileService = {
  async compile(input: TypstCompileInput): Promise<TypstCompileResult> {
    const workdir = await mkdtemp(join(tmpdir(), "aqsha-typst-"));
    const cache = cacheDir();
    await mkdir(cache, { recursive: true }).catch(() => {});
    try {
      await writeFile(join(workdir, "main.typ"), input.mainTyp, "utf8");
      if (input.bib != null) {
        await writeFile(join(workdir, "refs.bib"), input.bib, "utf8");
      }

      const args = [
        typstBin(),
        "compile",
        "--root",
        workdir,
        ...fontPathArgs(),
        "main.typ",
        "out.pdf",
      ];

      let run;
      try {
        run = await runSandboxed(args, {
          cwd: workdir,
          timeoutMs: input.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          maxMemoryKb: DEFAULT_MAX_MEMORY_KB,
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME,
            XDG_CACHE_HOME: cache,
          },
        });
      } catch {
        // Bun.spawn melempar bila binary tak ditemukan.
        throwAppError({
          message: "Compiler Typst tidak tersedia",
          code: "typst_unavailable",
          status: 503,
        });
      }
      if (run!.timedOut) {
        throwAppError({
          message: "Kompilasi Typst melebihi batas waktu",
          code: "typst_compile_timeout",
          status: 422,
        });
      }

      if (run!.exitCode !== 0) {
        const errors = parseTypstDiagnostics(run!.stderr).filter((e) => e.severity === "error");
        if (errors.length > 0) return { ok: false, errors };
        throwAppError({
          message: "Kompilasi Typst gagal tanpa error terstruktur",
          code: "typst_compile_failed",
          status: 500,
        });
      }

      const pdf = await readFile(join(workdir, "out.pdf")).catch(() => null);
      if (!pdf || pdf.byteLength === 0) {
        throwAppError({
          message: "Kompilasi selesai tanpa menghasilkan PDF",
          code: "typst_compile_failed",
          status: 500,
        });
      }
      const maxPdfBytes = input.options?.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES;
      if (pdf.byteLength > maxPdfBytes) {
        throwAppError({
          message: "PDF hasil kompilasi melebihi batas ukuran",
          code: "typst_output_too_large",
          status: 422,
        });
      }
      return { ok: true, pdf: new Uint8Array(pdf) };
    } finally {
      await rm(workdir, { recursive: true, force: true });
    }
  },
};
