# Research-first Fase 4: Gate pipeline compile LaTeX + sitasi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Buktikan server bisa mengubah `LaTeX + .bib` → `PDF` yang benar (sitasi biblatex ter-resolve via biber, SyncTeX ada dan inverse-map akurat) secara aman & andal — sebagai gate GO/NO-GO sebelum UI apa pun dibangun di atasnya.

**Architecture:** Modul baru `packages/services/src/latex/` berisi empat unit murni: sandboxed runner (satu-satunya penyentuh subprocess OS via `Bun.spawn`), log parser (log TeX → `CompileError[]`), SyncTeX parser + inverse lookup, dan `LatexCompileService` sebagai orkestrator (tmpdir per-job → Tectonic `--untrusted --only-cached` → PDF/synctex/log atau union error). Ekspor `.bib` dari perpustakaan = fungsi murni baru di domain citations (citation-js `format("biblatex")` + kunci sitasi stabil). Bukti gate = test harness env-gated (`bun test`) + image Docker Ubuntu 22.04 yang membuktikan offline-bundle & toolchain Linux.

**Tech Stack:** Tectonic 0.16.9 (single binary), biber 2.17 (eksternal, dipanggil otomatis oleh Tectonic), `@citation-js/core` + `@citation-js/plugin-bibtex` (sudah terpasang), `Bun.spawn`, `pdf-lib` (devDependency, hitung halaman di test), Docker BuildKit.

## Global Constraints

- Package manager **hanya `bun`** (pinned `1.3.10`); jangan pernah npm/pnpm/yarn.
- **Tectonic 0.16.9** (pin via brew / release asset musl); bundle default-nya = TeX Live 2022 dengan **biblatex 3.17 → wajib biber 2.17 PERSIS** (mismatch = `Error: Found biblatex control file version X, expected version Y`). Tectonic mencari `tectonic-biber` dulu, lalu `biber`, di PATH.
- Konvensi `packages/services`: service = **object literal** dengan method; `db` selalu argumen pertama (`DbOrTx`); TIDAK ada class/factory; error via `throwAppError` dari `@aqsha/db`; pesan error user-facing dalam **bahasa Indonesia** (contoh eksisting: `"Referensi tidak ditemukan"`).
- Error compile LaTeX (dokumen salah) = **union return** `{ ok: false, errors }`; timeout/OOM/infra = **`throwAppError`** (`latex_compile_timeout`, `latex_compile_failed`, `latex_bundle_missing`, `latex_output_too_large`, `latex_invalid_input`).
- Komentar kode: hanya **why**, tanpa referensi plan/fase/ticket, bahasa mengikuti file sekitar (komentar di `packages/services` banyak berbahasa Indonesia).
- Test = `bun test` di `packages/services/test/*.test.ts` (flat, bukan colocated); test yang butuh toolchain **self-skip** bila `tectonic`/`biber` tak ada (pola `const itest = cond ? test : test.skip` seperti `billing.test.ts` dengan `DATABASE_URL`).
- Tanpa route API, tanpa UI, tanpa migrasi DB — gate = service + test + bukti infra. Tidak perlu entri changelog (bukan perubahan user-facing, sesuai `docs/product/versioning-and-changelog.md`).
- `-Z deterministic-mode` **DILARANG** — merusak SyncTeX (path absolut dihilangkan).
- Batas keamanan yang diketahui dan HARUS masuk laporan gate: `--untrusted` + `TECTONIC_UNTRUSTED_MODE=1` mematikan shell-escape & extra search path, **tapi TIDAK menyandbox FS read** (`\input{/etc/passwd}` tetap bisa). Enforcement penuh = OS-level sandbox (container read-only, tanpa network) — urusan penempatan produksi Fase 5/6.

## File Structure

```
packages/services/
  src/latex/
    types.ts               # CompileError, CompileErrorSeverity
    log-parser.ts          # parseTexLog(log) → CompileError[]
    runner.ts              # runSandboxed(cmd, opts) → RunResult (satu-satunya Bun.spawn)
    synctex.ts             # parseSynctex(gz) → SynctexData; synctexInverseLookup()
    compile.service.ts     # LatexCompileService.compile(input) → LatexCompileResult
    index.ts               # barrel
  src/citations/
    citation-bib.ts        # generateBibKeys, buildBibliographyFile (CSL-JSON → .bib biblatex)
    citation.service.ts    # +method exportBib(db, { ownerUserId, citationIds? })
    index.ts               # +re-export citation-bib
  src/index.ts             # +re-export ./latex
  tsup.config.ts           # +entry "src/latex/index.ts"
  package.json             # +exports "./latex"; +devDependency pdf-lib
  test/
    fixtures/latex/
      sample-main.tex      # doc gate: heading, persamaan, gambar, 3 \cite, printbibliography
      sample-refs.bib      # .bib tulisan tangan utk smoke (gate test pakai .bib generated)
      pixel.png            # PNG 1×1 utk \includegraphics
      sample.synctex.gz    # hasil smoke Task 1 → fixture unit-test parser SyncTeX
    latex-log-parser.test.ts
    latex-runner.test.ts
    latex-synctex.test.ts
    citation-bib.test.ts
    latex-compile-service.test.ts
    latex-gate.test.ts     # 6 kriteria LOLOS
infra/latex-compile/
  Dockerfile               # Ubuntu 22.04 + tectonic musl + biber 2.17 + bun; warm cache; RUN --network=none bun test
  Dockerfile.dockerignore
docs/superpowers/specs/
  2026-07-18-research-first-phase4-latex-gate-report.md   # laporan GO/NO-GO (Task 9)
```

Semua perintah dijalankan dari root repo kecuali disebut lain. Jalankan satu file test: `cd packages/services && bun test test/<nama>.test.ts`.

---

### Task 1: Toolchain lokal + fixtures + smoke compile manual

Tujuan: matikan risiko #1 (orkestrasi Tectonic+biblatex+biber) dan #2 (SyncTeX) SEBELUM menulis kode, plus warm cache Tectonic yang dibutuhkan semua test berikutnya.

**Files:**
- Create: `packages/services/test/fixtures/latex/sample-main.tex`
- Create: `packages/services/test/fixtures/latex/sample-refs.bib`
- Create: `packages/services/test/fixtures/latex/pixel.png`
- Create: `packages/services/test/fixtures/latex/sample.synctex.gz` (hasil smoke, di-commit sebagai fixture parser)

**Interfaces:**
- Consumes: —
- Produces: toolchain terverifikasi (`tectonic` 0.16.9 + biber 2.17 di PATH), cache Tectonic berisi semua paket fixture (article, amsmath, graphicx, biblatex authoryear), dan 4 file fixture di atas. Task 4 memparse `sample.synctex.gz` dengan asumsi nomor baris `sample-main.tex` persis seperti ditulis di sini (baris 8 = kalimat ber-`\cite`, baris 10 = `E = mc^2`, baris 15 = `\printbibliography`).

- [ ] **Step 1: Install Tectonic**

```bash
brew install tectonic
tectonic --version
```

Expected: `Tectonic 0.16.9` (0.16.x lain juga diterima — catat versinya).

- [ ] **Step 2: Install biber 2.17 sebagai `tectonic-biber`**

biber TIDAK ada di homebrew-core dan Tectonic tidak membawanya. Bundle default Tectonic 0.16.x memuat biblatex 3.17 yang menuntut biber **2.17 persis**. Unduh binary darwin dari SourceForge:

```bash
curl -L -o /tmp/biber217.tar.gz \
  "https://downloads.sourceforge.net/project/biblatex-biber/biblatex-biber/2.17/binaries/MacOS/biber-darwin_universal.tar.gz"
tar -xzf /tmp/biber217.tar.gz -C /tmp
sudo mv /tmp/biber /opt/homebrew/bin/tectonic-biber
sudo chmod +x /opt/homebrew/bin/tectonic-biber
xattr -d com.apple.quarantine /opt/homebrew/bin/tectonic-biber 2>/dev/null || true
tectonic-biber --version
```

Expected: `biber version: 2.17`.

Kalau URL 404, buka listing `https://sourceforge.net/projects/biblatex-biber/files/biblatex-biber/2.17/binaries/MacOS/` dan pakai tarball darwin yang tersedia di sana. **Fallback kalau binary darwin tidak jalan di mesin ini (arm64):** lewati — semua test latex self-skip di lokal, dan bukti gate lokal digantikan sepenuhnya oleh Task 8 (Docker). Catat kondisi ini untuk laporan Task 9.

- [ ] **Step 3: Tulis fixtures**

`packages/services/test/fixtures/latex/sample-main.tex` — **persis** ini (nomor baris dipakai test SyncTeX; jangan menambah/menghapus baris):

```tex
\documentclass{article}
\usepackage{amsmath}
\usepackage{graphicx}
\usepackage[backend=biber,style=authoryear]{biblatex}
\addbibresource{refs.bib}
\begin{document}
\section{Pendahuluan}
Metode penelitian kualitatif \cite{sugiyono2019} berkembang pesat \cite{creswell2018}.
\begin{equation}
  E = mc^2
\end{equation}
\includegraphics[width=2cm]{pixel.png}
Pendekatan campuran juga dipakai \cite{nurhaliza2021}.
\newpage
\printbibliography
\end{document}
```

`packages/services/test/fixtures/latex/sample-refs.bib`:

```bib
@book{sugiyono2019,
  author = {Sugiyono, Andi},
  title = {Metode Penelitian Kuantitatif, Kualitatif, dan R\&D},
  year = {2019},
  publisher = {Alfabeta},
}
@book{creswell2018,
  author = {Creswell, John W. and Creswell, J. David},
  title = {Research Design: Qualitative, Quantitative, and Mixed Methods Approaches},
  year = {2018},
  publisher = {SAGE},
}
@article{nurhaliza2021,
  author = {Nurhaliza, Siti},
  title = {Pendekatan Campuran dalam Penelitian Pendidikan},
  journaltitle = {Jurnal Ilmu Pendidikan},
  year = {2021},
  volume = {27},
  pages = {101--115},
}
```

`pixel.png` (PNG 1×1):

```bash
echo "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==" \
  | base64 -d > packages/services/test/fixtures/latex/pixel.png
file packages/services/test/fixtures/latex/pixel.png
```

Expected: `PNG image data, 1 x 1`.

- [ ] **Step 4: Smoke compile (warm cache; jaringan BOLEH di langkah ini saja)**

```bash
T=$(mktemp -d)
cp packages/services/test/fixtures/latex/sample-main.tex "$T/main.tex"
cp packages/services/test/fixtures/latex/sample-refs.bib "$T/refs.bib"
cp packages/services/test/fixtures/latex/pixel.png "$T/pixel.png"
(cd "$T" && tectonic --untrusted --synctex --keep-logs --keep-intermediates --outdir out main.tex)
ls -la "$T/out"
```

Expected: exit 0; `out/` berisi `main.pdf`, `main.synctex.gz`, `main.log`, `main.bbl`, `main.aux`, `main.blg`, `main.run.xml`. Ini SEKALIGUS bukti Tectonic mendeteksi `.run.xml` dan menjalankan biber otomatis (risiko #1). Kalau gagal dengan `Found biblatex control file version …` → versi biber salah, ulangi Step 2.

- [ ] **Step 5: Verifikasi isi hasil smoke**

```bash
grep -c "sugiyono2019\|creswell2018\|nurhaliza2021" "$T/out/main.bbl"
grep -i "citation.*undefined" "$T/out/main.log" || echo "OK: tidak ada sitasi undefined"
mdls -name kMDItemNumberOfPages "$T/out/main.pdf"
open "$T/out/main.pdf"
```

Expected: grep bbl ≥ 3; "OK: tidak ada sitasi undefined"; `kMDItemNumberOfPages = 2`; visual: halaman 1 = heading + persamaan + gambar + sitasi authoryear, halaman 2 = daftar pustaka 3 entri.

- [ ] **Step 6: Bukti cepat `--only-cached` dan blokade `\write18`**

```bash
T2=$(mktemp -d)
cp "$T"/{main.tex,refs.bib,pixel.png} "$T2/" 2>/dev/null || { cp "$T/main.tex" "$T2/"; cp "$T/refs.bib" "$T2/"; cp "$T/pixel.png" "$T2/"; }
(cd "$T2" && tectonic --untrusted --only-cached --synctex --outdir out main.tex && echo "OK: offline compile")
printf '%s\n' '\documentclass{article}' '\begin{document}' "\\immediate\\write18{touch $T2/PWNED}" 'aman' '\end{document}' > "$T2/evil.tex"
(cd "$T2" && tectonic --untrusted --outdir out-evil evil.tex; test ! -f "$T2/PWNED" && echo "OK: write18 diblok")
```

Expected: `OK: offline compile` dan `OK: write18 diblok`.

- [ ] **Step 7: Simpan synctex hasil smoke sebagai fixture**

```bash
cp "$T/out/main.synctex.gz" packages/services/test/fixtures/latex/sample.synctex.gz
```

- [ ] **Step 8: Commit**

```bash
git add packages/services/test/fixtures/latex/
git commit -m "test(services): fixture gate latex (doc contoh, bib, png, synctex sample)"
```

---

### Task 2: Scaffold modul latex + log parser

**Files:**
- Create: `packages/services/src/latex/types.ts`
- Create: `packages/services/src/latex/log-parser.ts`
- Create: `packages/services/src/latex/index.ts`
- Modify: `packages/services/tsup.config.ts` (array `entry`)
- Modify: `packages/services/package.json` (blok `exports`)
- Modify: `packages/services/src/index.ts` (root barrel)
- Test: `packages/services/test/latex-log-parser.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `type CompileError = { line: number | null; message: string; severity: "error" | "warning" }` dan `parseTexLog(log: string): CompileError[]` — dipakai Task 6 (compile service) dan Task 7 (gate).

- [ ] **Step 1: Tulis failing test**

`packages/services/test/latex-log-parser.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { parseTexLog } from "../src/latex/log-parser";

const ERROR_LOG = [
  "This is XeTeX, Version 3.141592653 (Tectonic 0.16.9)",
  "(./main.tex",
  "LaTeX2e <2021-11-15>",
  "! Undefined control sequence.",
  "l.9 \\undefinedmacro",
  "",
  "The control sequence at the end of the top line of your error message was never",
  "! LaTeX Error: File `missing.png' not found.",
  "",
  "See the LaTeX manual or LaTeX Companion for explanation.",
  "l.13 \\includegraphics{missing.png}",
  "",
  "LaTeX Warning: Citation 'foo2020' on page 1 undefined on input line 8.",
  "",
  "! ==> Fatal error occurred, no output PDF file produced!",
].join("\n");

describe("parseTexLog", () => {
  test("mengekstrak error dengan nomor baris dari pola ! + l.<n>", () => {
    const errors = parseTexLog(ERROR_LOG).filter((e) => e.severity === "error");
    expect(errors).toHaveLength(2);
    expect(errors[0]).toEqual({
      line: 9,
      message: "Undefined control sequence.",
      severity: "error",
    });
    expect(errors[1]?.line).toBe(13);
    expect(errors[1]?.message).toContain("File `missing.png' not found");
  });

  test("mengekstrak warning dengan nomor baris dari 'on input line'", () => {
    const warnings = parseTexLog(ERROR_LOG).filter((e) => e.severity === "warning");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.line).toBe(8);
    expect(warnings[0]?.message).toContain("Citation 'foo2020'");
  });

  test("mengabaikan baris fatal '==>' (bukan error yang actionable)", () => {
    const messages = parseTexLog(ERROR_LOG).map((e) => e.message);
    expect(messages.some((m) => m.startsWith("==>"))).toBe(false);
  });

  test("log sukses tanpa error → array kosong", () => {
    expect(parseTexLog("This is XeTeX\nOutput written on main.pdf (2 pages).")).toEqual([]);
  });

  test("error tanpa l.<n> di dekatnya → line null", () => {
    const errors = parseTexLog("! Emergency stop.\n<*> main.tex\n");
    expect(errors).toEqual([{ line: null, message: "Emergency stop.", severity: "error" }]);
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd packages/services && bun test test/latex-log-parser.test.ts`
Expected: FAIL (`Cannot find module '../src/latex/log-parser'`).

- [ ] **Step 3: Implementasi**

`packages/services/src/latex/types.ts`:

```ts
export type CompileErrorSeverity = "error" | "warning";

export type CompileError = {
  /** Nomor baris di main.tex; null bila log tak menyebut lokasi. */
  line: number | null;
  message: string;
  severity: CompileErrorSeverity;
};
```

`packages/services/src/latex/log-parser.ts`:

```ts
import type { CompileError } from "./types";

const ERROR_LINE = /^!\s?(.*)$/;
const LINE_REF = /^l\.(\d+)/;
const WARNING_LINE = /^(?:LaTeX|Package \S+|Class \S+) Warning: (.*)$/;
const ON_INPUT_LINE = /on input line (\d+)\.?\s*$/;

/**
 * Parser log transcript TeX (ditulis Tectonic via --keep-logs). Deterministik:
 * error = baris "!" + nomor baris dari "l.<n>" terdekat sesudahnya; warning =
 * baris "LaTeX/Package/Class Warning" + nomor dari "on input line <n>".
 */
export function parseTexLog(log: string): CompileError[] {
  const lines = log.split(/\r?\n/);
  const found: CompileError[] = [];
  for (let i = 0; i < lines.length; i++) {
    const err = lines[i]?.match(ERROR_LINE);
    if (err) {
      const message = (err[1] ?? "").trim();
      // "! ==> Fatal error occurred..." cuma penanda akhir, bukan error actionable.
      if (!message || message.startsWith("==>")) continue;
      let line: number | null = null;
      for (let j = i + 1; j < Math.min(i + 12, lines.length); j++) {
        const candidate = lines[j] ?? "";
        const ref = candidate.match(LINE_REF);
        if (ref) {
          line = Number(ref[1]);
          break;
        }
        if (ERROR_LINE.test(candidate)) break;
      }
      found.push({ line, message, severity: "error" });
      continue;
    }
    const warn = lines[i]?.match(WARNING_LINE);
    if (warn) {
      const message = (warn[1] ?? "").trim();
      const onLine = message.match(ON_INPUT_LINE);
      found.push({
        line: onLine ? Number(onLine[1]) : null,
        message,
        severity: "warning",
      });
    }
  }
  return found;
}
```

`packages/services/src/latex/index.ts` (barrel — tumbuh per task):

```ts
export { parseTexLog } from "./log-parser";
export type { CompileError, CompileErrorSeverity } from "./types";
```

- [ ] **Step 4: Wiring build/exports**

Di `packages/services/tsup.config.ts`, tambahkan ke array `entry` setelah `"src/citations/index.ts"`:

```ts
    "src/latex/index.ts",
```

Di `packages/services/package.json`, tambahkan blok setelah `"./citations"` (cermin persis blok `"./citations"` yang ada di lines 105–111):

```json
    "./latex": {
      "types": "./src/latex/index.ts",
      "bun": "./src/latex/index.ts",
      "node": "./dist/latex/index.js",
      "import": "./dist/latex/index.js",
      "default": "./dist/latex/index.js"
    }
```

(Perhatikan koma: blok `"./citations"` yang tadinya terakhir kini butuh koma penutup.)

Di `packages/services/src/index.ts`, tambahkan di akhir file:

```ts
export {
  type CompileError,
  type CompileErrorSeverity,
  parseTexLog,
} from "./latex";
```

- [ ] **Step 5: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/latex-log-parser.test.ts`
Expected: 5 pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add packages/services/src/latex packages/services/src/index.ts packages/services/tsup.config.ts packages/services/package.json packages/services/test/latex-log-parser.test.ts
git commit -m "feat(services): modul latex + parser log TeX terstruktur"
```

---

### Task 3: Sandboxed runner (Bun.spawn)

**Files:**
- Create: `packages/services/src/latex/runner.ts`
- Modify: `packages/services/src/latex/index.ts`
- Test: `packages/services/test/latex-runner.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  ```ts
  type RunResult = { exitCode: number | null; stdout: string; stderr: string; timedOut: boolean; killedBy: string | null };
  type RunOptions = { cwd: string; timeoutMs: number; env?: Record<string, string | undefined>; maxOutputBytes?: number; maxMemoryKb?: number };
  runSandboxed(cmd: string[], opts: RunOptions): Promise<RunResult>
  ```
  Dipakai Task 6. Kontrak penting: env TIDAK diwariskan dari proses induk (caller wajib pass PATH eksplisit); saat `timedOut === true`, `exitCode === null`.

- [ ] **Step 1: Tulis failing test**

`packages/services/test/latex-runner.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { runSandboxed } from "../src/latex/runner";

const CWD = tmpdir();

describe("runSandboxed", () => {
  test("menjalankan perintah dan menangkap stdout + exit code", async () => {
    const result = await runSandboxed(["/bin/sh", "-c", "echo halo && exit 0"], {
      cwd: CWD,
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("halo");
    expect(result.timedOut).toBe(false);
  });

  test("meneruskan exit code bukan-nol dan stderr", async () => {
    const result = await runSandboxed(["/bin/sh", "-c", "echo galat >&2; exit 3"], {
      cwd: CWD,
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim()).toBe("galat");
  });

  test("timeout → kill, timedOut=true, exitCode=null", async () => {
    const started = Date.now();
    const result = await runSandboxed(["/bin/sh", "-c", "sleep 5"], {
      cwd: CWD,
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("output dipotong pada maxOutputBytes tanpa menggantung proses", async () => {
    const result = await runSandboxed(
      ["/bin/sh", "-c", "head -c 1000000 /dev/zero | tr '\\0' 'a'"],
      { cwd: CWD, timeoutMs: 10_000, maxOutputBytes: 10_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(10_000);
  });

  test("env induk tidak bocor; hanya env eksplisit yang terlihat", async () => {
    process.env.AQSHA_RUNNER_LEAK_PROBE = "bocor";
    try {
      const result = await runSandboxed(
        ["/bin/sh", "-c", 'echo "[$AQSHA_RUNNER_LEAK_PROBE][$EXPLICIT]"'],
        { cwd: CWD, timeoutMs: 5000, env: { EXPLICIT: "ada" } },
      );
      expect(result.stdout.trim()).toBe("[][ada]");
    } finally {
      delete process.env.AQSHA_RUNNER_LEAK_PROBE;
    }
  });

  test("maxMemoryKb membungkus perintah tanpa merusaknya (cap efektif hanya Linux)", async () => {
    const result = await runSandboxed(["/bin/echo", "ok"], {
      cwd: CWD,
      timeoutMs: 5000,
      maxMemoryKb: 2_097_152,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd packages/services && bun test test/latex-runner.test.ts`
Expected: FAIL (`Cannot find module '../src/latex/runner'`).

- [ ] **Step 3: Implementasi**

`packages/services/src/latex/runner.ts`:

```ts
export type RunResult = {
  /** null bila proses dibunuh karena timeout. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killedBy: string | null;
};

export type RunOptions = {
  cwd: string;
  timeoutMs: number;
  /** Env eksplisit; env proses induk TIDAK diwariskan (caller wajib pass PATH sendiri). */
  env?: Record<string, string | undefined>;
  maxOutputBytes?: number;
  /** Cap address-space via `ulimit -v` — efektif di Linux, no-op senyap di macOS. */
  maxMemoryKb?: number;
};

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

async function drainCapped(
  stream: ReadableStream<Uint8Array>,
  cap: number,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of stream) {
    // Terus drain melewati cap supaya pipe child tak penuh dan proses tak menggantung.
    if (out.length < cap) out += decoder.decode(chunk, { stream: true });
  }
  return out.slice(0, cap);
}

function withMemoryLimit(cmd: string[], maxMemoryKb?: number): string[] {
  if (!maxMemoryKb) return cmd;
  return [
    "/bin/sh",
    "-c",
    `ulimit -v ${maxMemoryKb} 2>/dev/null || true; exec "$@"`,
    "sh",
    ...cmd,
  ];
}

export async function runSandboxed(cmd: string[], opts: RunOptions): Promise<RunResult> {
  const proc = Bun.spawn({
    cmd: withMemoryLimit(cmd, opts.maxMemoryKb),
    cwd: opts.cwd,
    env: opts.env ?? {},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, opts.timeoutMs);
  const cap = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const [stdout, stderr, exitCode] = await Promise.all([
    drainCapped(proc.stdout, cap),
    drainCapped(proc.stderr, cap),
    proc.exited,
  ]);
  clearTimeout(timer);
  return {
    exitCode: timedOut ? null : exitCode,
    stdout,
    stderr,
    timedOut,
    killedBy: proc.signalCode ?? null,
  };
}
```

Tambahkan ke `packages/services/src/latex/index.ts`:

```ts
export { type RunOptions, type RunResult, runSandboxed } from "./runner";
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/latex-runner.test.ts`
Expected: 6 pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex packages/services/test/latex-runner.test.ts
git commit -m "feat(services): sandboxed runner subprocess untuk compile latex"
```

---

### Task 4: Parser SyncTeX + inverse lookup

**Files:**
- Create: `packages/services/src/latex/synctex.ts`
- Modify: `packages/services/src/latex/index.ts`
- Test: `packages/services/test/latex-synctex.test.ts` (pakai fixture `sample.synctex.gz` dari Task 1 — deterministik, tanpa toolchain)

**Interfaces:**
- Consumes: fixture `test/fixtures/latex/sample.synctex.gz` + nomor baris `sample-main.tex` (baris 8 = kalimat `\cite`).
- Produces:
  ```ts
  type SynctexRecord = { kind: string; tag: number; line: number; x: number; y: number; page: number };
  type SynctexData = { unit: number; magnification: number; xOffset: number; yOffset: number; inputs: Map<number, string>; records: SynctexRecord[] };
  parseSynctex(synctexGz: Uint8Array): SynctexData
  synctexInverseLookup(data: SynctexData, target: { page: number; x: number; y: number }): { file: string; line: number; distance: number } | null
  ```
  Dipakai Task 7 (kriteria gate #3) dan kelak lapisan anotasi Fase 6. Koordinat = satuan sp mentah dari file synctex; konversi ke PDF point (sp/65536 dst.) = urusan Fase 6.

- [ ] **Step 1: Tulis failing test**

`packages/services/test/latex-synctex.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";

const FIXTURE = new Uint8Array(
  readFileSync(join(import.meta.dir, "fixtures/latex/sample.synctex.gz")),
);
// Baris di sample-main.tex (fixture Task 1): kalimat berisi \cite.
const CITE_LINE = 8;

describe("parseSynctex", () => {
  test("membaca preamble: unit, magnification, dan daftar input", () => {
    const data = parseSynctex(FIXTURE);
    expect(data.unit).toBeGreaterThan(0);
    expect(data.magnification).toBeGreaterThan(0);
    expect([...data.inputs.values()].some((p) => p.endsWith("main.tex"))).toBe(true);
  });

  test("mengekstrak record posisi ber-halaman", () => {
    const data = parseSynctex(FIXTURE);
    expect(data.records.length).toBeGreaterThan(50);
    expect(data.records.every((r) => r.page >= 1)).toBe(true);
    expect(data.records.some((r) => r.page === 2)).toBe(true);
  });

  test("ada record halaman 1 untuk baris kalimat \\cite di main.tex", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const hit = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(hit).toBeDefined();
  });
});

describe("synctexInverseLookup", () => {
  test("koordinat sebuah record → kembali ke baris sumber yang sama", () => {
    const data = parseSynctex(FIXTURE);
    const mainTags = new Set(
      [...data.inputs.entries()].filter(([, p]) => p.endsWith("main.tex")).map(([t]) => t),
    );
    const anchor = data.records.find(
      (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - CITE_LINE) <= 1,
    );
    expect(anchor).toBeDefined();
    if (!anchor) return;
    const found = synctexInverseLookup(data, {
      page: 1,
      x: anchor.x + 1000,
      y: anchor.y,
    });
    expect(found).not.toBeNull();
    expect(found?.file.endsWith("main.tex")).toBe(true);
    expect(Math.abs((found?.line ?? 0) - CITE_LINE)).toBeLessThanOrEqual(2);
  });

  test("halaman tanpa record → null", () => {
    const data = parseSynctex(FIXTURE);
    expect(synctexInverseLookup(data, { page: 99, x: 0, y: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd packages/services && bun test test/latex-synctex.test.ts`
Expected: FAIL (`Cannot find module '../src/latex/synctex'`).

- [ ] **Step 3: Implementasi**

`packages/services/src/latex/synctex.ts`:

```ts
import { gunzipSync } from "node:zlib";

export type SynctexRecord = {
  kind: string;
  tag: number;
  line: number;
  x: number;
  y: number;
  page: number;
};

export type SynctexData = {
  unit: number;
  magnification: number;
  xOffset: number;
  yOffset: number;
  /** tag → path file input (absolut; Tectonic sengaja menulis path absolut). */
  inputs: Map<number, string>;
  records: SynctexRecord[];
};

const INPUT_LINE = /^Input:(\d+):(.+)$/;
// Satu bentuk untuk record berkoordinat: pembuka box "(" "[", void box v/h,
// dan record titik x/k/g/$ — semuanya `<kind><tag>,<line>:<x>,<y>...`.
const RECORD_LINE = /^([([xkg$vh])(-?\d+),(-?\d+):(-?\d+),(-?\d+)/;
const PAGE_OPEN = /^\{(\d+)$/;

/**
 * Parser minimal format synctex (teks, gzip). Koordinat dibiarkan dalam satuan
 * mentah file (sp × unit); konsumen memutuskan konversi ke satuan PDF.
 */
export function parseSynctex(synctexGz: Uint8Array): SynctexData {
  const text = new TextDecoder().decode(gunzipSync(synctexGz));
  const inputs = new Map<number, string>();
  const records: SynctexRecord[] = [];
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  let page = 0;

  for (const raw of text.split("\n")) {
    const input = raw.match(INPUT_LINE);
    if (input) {
      inputs.set(Number(input[1]), (input[2] ?? "").trim());
      continue;
    }
    if (raw.startsWith("Unit:")) {
      unit = Number(raw.slice(5)) || 1;
      continue;
    }
    if (raw.startsWith("Magnification:")) {
      magnification = Number(raw.slice(14)) || 1000;
      continue;
    }
    if (raw.startsWith("X Offset:")) {
      xOffset = Number(raw.slice(9)) || 0;
      continue;
    }
    if (raw.startsWith("Y Offset:")) {
      yOffset = Number(raw.slice(9)) || 0;
      continue;
    }
    const pageOpen = raw.match(PAGE_OPEN);
    if (pageOpen) {
      page = Number(pageOpen[1]);
      continue;
    }
    if (page === 0) continue;
    const rec = raw.match(RECORD_LINE);
    if (rec) {
      records.push({
        kind: rec[1] ?? "",
        tag: Number(rec[2]),
        line: Number(rec[3]),
        x: Number(rec[4]),
        y: Number(rec[5]),
        page,
      });
    }
  }
  return { unit, magnification, xOffset, yOffset, inputs, records };
}

/** Inverse mapping ala klik-ke-sumber: cari record terdekat pada halaman target. */
export function synctexInverseLookup(
  data: SynctexData,
  target: { page: number; x: number; y: number },
): { file: string; line: number; distance: number } | null {
  let best: { file: string; line: number; distance: number } | null = null;
  for (const record of data.records) {
    if (record.page !== target.page) continue;
    const distance = (record.x - target.x) ** 2 + (record.y - target.y) ** 2;
    if (!best || distance < best.distance) {
      best = {
        file: data.inputs.get(record.tag) ?? "",
        line: record.line,
        distance,
      };
    }
  }
  return best;
}
```

Tambahkan ke `packages/services/src/latex/index.ts`:

```ts
export {
  parseSynctex,
  type SynctexData,
  type SynctexRecord,
  synctexInverseLookup,
} from "./synctex";
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/latex-synctex.test.ts`
Expected: 5 pass, 0 fail. Kalau test "record halaman 1 untuk baris \cite" gagal: buka isi fixture (`gunzip -c packages/services/test/fixtures/latex/sample.synctex.gz | head -50`) dan sesuaikan regex `RECORD_LINE` dengan bentuk nyata record (format synctex punya varian minor antar engine) — JANGAN mengendurkan assertion barisnya.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex packages/services/test/latex-synctex.test.ts
git commit -m "feat(services): parser synctex + inverse lookup klik-ke-sumber"
```

---

### Task 5: Ekspor BibLaTeX dari perpustakaan (kunci sitasi stabil)

**Files:**
- Create: `packages/services/src/citations/citation-bib.ts`
- Modify: `packages/services/src/citations/citation.service.ts` (method `exportBib`, letakkan tepat setelah method `export` yang ada di `citation.service.ts:832-855`)
- Modify: `packages/services/src/citations/index.ts`
- Test: `packages/services/test/citation-bib.test.ts`

**Interfaces:**
- Consumes: `CslItem` dari `./citation-normalize`; `Cite` dari `@citation-js/core` + side-effect import `@citation-js/plugin-bibtex` (pola sama dengan `citation-format.ts:1-5`); `CitationRepo.findByIds` / `CitationRepo.listAllActive` dari `@aqsha/db` (pola fetch persis method `export` yang ada).
- Produces:
  ```ts
  type BibliographyExport = { bib: string; keyById: Record<string, string> };
  generateBibKeys(items: Array<{ id: string; csl: CslItem }>): Record<string, string>
  buildBibliographyFile(items: Array<{ id: string; csl: CslItem }>): BibliographyExport
  CitationService.exportBib(db: DbOrTx, input: { ownerUserId: string; citationIds?: string[] }): Promise<BibliographyExport>
  ```
  Kunci hanya `[a-z0-9]` (aman untuk `\cite{}`), deterministik terhadap himpunan input, tabrakan diselesaikan dengan suffix `a,b,c…`. Dipakai Task 7.

- [ ] **Step 1: Tulis failing test**

`packages/services/test/citation-bib.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildBibliographyFile, generateBibKeys } from "../src/citations/citation-bib";
import type { CslItem } from "../src/citations/citation-normalize";

const book = (over: Record<string, unknown> = {}): CslItem => ({
  type: "book",
  title: "Metode Penelitian",
  author: [{ family: "Sugiyono", given: "Andi" }],
  issued: { "date-parts": [[2019]] },
  publisher: "Alfabeta",
  ...over,
});

describe("generateBibKeys", () => {
  test("kunci = family penulis pertama + tahun, lowercase alfanumerik", () => {
    expect(generateBibKeys([{ id: "c1", csl: book() }])).toEqual({ c1: "sugiyono2019" });
  });

  test("tabrakan → suffix a, b deterministik berdasar urutan id", () => {
    const keys = generateBibKeys([
      { id: "c2", csl: book() },
      { id: "c1", csl: book() },
      { id: "c3", csl: book() },
    ]);
    expect(keys.c1).toBe("sugiyono2019");
    expect(keys.c2).toBe("sugiyono2019a");
    expect(keys.c3).toBe("sugiyono2019b");
  });

  test("diakritik dibuang; non-alfanumerik dibuang", () => {
    const keys = generateBibKeys([
      { id: "c1", csl: book({ author: [{ family: "Çelik-Ö'Brien", given: "T." }] }) },
    ]);
    expect(keys.c1).toBe("celikobrien2019");
  });

  test("tanpa author → fallback 'ref'; tanpa tahun → tanpa angka", () => {
    const keys = generateBibKeys([
      { id: "c1", csl: { type: "webpage", title: "Anon" } },
      { id: "c2", csl: book({ author: [{ literal: "Badan Pusat Statistik" }] }) },
    ]);
    expect(keys.c1).toBe("ref");
    expect(keys.c2).toBe("badanpusatstatistik2019");
  });
});

describe("buildBibliographyFile", () => {
  test("menghasilkan entri biblatex dengan kunci yang di-generate", () => {
    const { bib, keyById } = buildBibliographyFile([
      { id: "c1", csl: book() },
      {
        id: "c2",
        csl: {
          type: "article-journal",
          title: "Pendekatan Campuran",
          author: [{ family: "Nurhaliza", given: "Siti" }],
          issued: { "date-parts": [[2021]] },
          "container-title": "Jurnal Ilmu Pendidikan",
        },
      },
    ]);
    expect(keyById).toEqual({ c1: "sugiyono2019", c2: "nurhaliza2021" });
    expect(bib).toMatch(/@\w+\{sugiyono2019,/);
    expect(bib).toMatch(/@\w+\{nurhaliza2021,/);
    expect(bib).toContain("Metode Penelitian");
  });

  test("himpunan kosong → bib kosong dan peta kosong (dokumen tanpa sitasi valid)", () => {
    expect(buildBibliographyFile([])).toEqual({ bib: "", keyById: {} });
  });
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd packages/services && bun test test/citation-bib.test.ts`
Expected: FAIL (`Cannot find module '../src/citations/citation-bib'`).

- [ ] **Step 3: Implementasi fungsi murni**

`packages/services/src/citations/citation-bib.ts`:

```ts
/// <reference path="./citation-js.d.ts" />
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import type { CslItem } from "./citation-normalize";

export type BibliographyExport = {
  bib: string;
  /** citationId → kunci \cite{} yang dipakai di .bib. */
  keyById: Record<string, string>;
};

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}+/gu, "");
}

/** a, b, …, z, aa, ab, … untuk disambiguasi kunci yang bertabrakan. */
function collisionSuffix(n: number): string {
  let s = "";
  let i = n;
  while (i > 0) {
    i -= 1;
    s = String.fromCharCode(97 + (i % 26)) + s;
    i = Math.floor(i / 26);
  }
  return s;
}

function baseBibKey(csl: CslItem): string {
  const authors = Array.isArray(csl.author)
    ? (csl.author as Array<Record<string, unknown>>)
    : [];
  const first = authors[0] ?? {};
  const name =
    typeof first.family === "string" && first.family
      ? first.family
      : typeof first.literal === "string"
        ? first.literal
        : "";
  const issued = csl.issued as { "date-parts"?: Array<Array<number | string>> } | undefined;
  const year = issued?.["date-parts"]?.[0]?.[0];
  const slug = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return `${slug || "ref"}${year ?? ""}`;
}

/**
 * Kunci sitasi stabil: deterministik terhadap himpunan input (diurut by id),
 * bebas tabrakan via suffix a/b/c…, hanya [a-z0-9] — aman untuk \cite{}.
 */
export function generateBibKeys(
  items: Array<{ id: string; csl: CslItem }>,
): Record<string, string> {
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  const taken = new Set<string>();
  const keyById: Record<string, string> = {};
  for (const item of sorted) {
    const base = baseBibKey(item.csl);
    let key = base;
    for (let n = 1; taken.has(key); n++) key = `${base}${collisionSuffix(n)}`;
    taken.add(key);
    keyById[item.id] = key;
  }
  return keyById;
}

/** CSL-JSON perpustakaan → isi file .bib (dialek biblatex) + peta id→kunci. */
export function buildBibliographyFile(
  items: Array<{ id: string; csl: CslItem }>,
): BibliographyExport {
  const keyById = generateBibKeys(items);
  if (items.length === 0) return { bib: "", keyById };
  const withKeys = items.map(({ id, csl }) => ({
    // citation-js menolak item tanpa type; fallback generik untuk data lama.
    type: "document",
    ...csl,
    id: keyById[id],
    "citation-key": keyById[id],
  }));
  const cite = new Cite(withKeys, { generateGraph: false });
  return { bib: cite.format("biblatex") as string, keyById };
}
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/citation-bib.test.ts`
Expected: 6 pass, 0 fail. Kalau assertion `@\w+\{sugiyono2019,` gagal karena citation-js memakai label lain, inspect output `console.log(bib)` — bila label ternyata dari field lain, paksa via `id` saja (hapus `"citation-key"`) dan pastikan tetap lolos; JANGAN mengendurkan assertion kunci.

- [ ] **Step 5: Method service `exportBib`**

Di `packages/services/src/citations/citation.service.ts`, tambahkan import di bagian atas file (dekat import `exportCitations` dari `./citation-format`):

```ts
import { type BibliographyExport, buildBibliographyFile } from "./citation-bib";
```

Lalu tambahkan method berikut TEPAT setelah method `export` (setelah baris `},` pada `citation.service.ts:855`), meniru pola fetch method `export`:

```ts
  /**
   * .bib (biblatex) dari perpustakaan + peta id→kunci \cite{}. Himpunan kosong
   * sah (dokumen tanpa sitasi tetap harus bisa compile) — beda dengan `export`
   * yang menolak ekspor kosong.
   */
  async exportBib(
    db: DbOrTx,
    input: { ownerUserId: string; citationIds?: string[] },
  ): Promise<BibliographyExport> {
    const rows = input.citationIds?.length
      ? (await CitationRepo.findByIds(db, input.ownerUserId, input.citationIds)).filter(
          (r) => !r.deletedAt,
        )
      : await CitationRepo.listAllActive(db, input.ownerUserId);
    return buildBibliographyFile(rows.map((r) => ({ id: r.id, csl: r.cslJson as CslItem })));
  },
```

Tambahkan test method (masih di `test/citation-bib.test.ts`, pola `spyOn` seperti `citation-service.test.ts`):

```ts
import { afterEach, mock, spyOn } from "bun:test";
import { CitationRepo } from "@aqsha/db";
import { CitationService } from "../src/citations/citation.service";

afterEach(() => {
  mock.restore();
});

describe("CitationService.exportBib", () => {
  test("memetakan baris repo → bib + keyById", async () => {
    spyOn(CitationRepo, "listAllActive").mockResolvedValue([
      {
        id: "row-1",
        deletedAt: null,
        cslJson: {
          type: "book",
          title: "Metode Penelitian",
          author: [{ family: "Sugiyono" }],
          issued: { "date-parts": [[2019]] },
        },
      },
    ] as never);
    const result = await CitationService.exportBib({} as never, { ownerUserId: "u1" });
    expect(result.keyById).toEqual({ "row-1": "sugiyono2019" });
    expect(result.bib).toMatch(/@\w+\{sugiyono2019,/);
  });
});
```

(Bila `CitationRepo` ternyata bukan export dari `@aqsha/db` melainkan dari subpath lain, ikuti persis import yang dipakai `citation.service.ts` di bagian atas file itu.)

- [ ] **Step 6: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/citation-bib.test.ts`
Expected: 7 pass, 0 fail.

- [ ] **Step 7: Barrel exports**

Tambahkan ke `packages/services/src/citations/index.ts` (urut alfabet file, setelah blok `./citation-format`):

```ts
export {
  type BibliographyExport,
  buildBibliographyFile,
  generateBibKeys,
} from "./citation-bib";
```

- [ ] **Step 8: Commit**

```bash
git add packages/services/src/citations packages/services/test/citation-bib.test.ts
git commit -m "feat(services): ekspor biblatex dari perpustakaan dengan kunci sitasi stabil"
```

---

### Task 6: LatexCompileService

**Files:**
- Create: `packages/services/src/latex/compile.service.ts`
- Modify: `packages/services/src/latex/index.ts`
- Modify: `packages/services/src/index.ts` (root barrel: ganti blok re-export latex agar lengkap)
- Test: `packages/services/test/latex-compile-service.test.ts`

**Interfaces:**
- Consumes: `runSandboxed` (Task 3), `parseTexLog` + `CompileError` (Task 2), `throwAppError` dari `@aqsha/db`.
- Produces:
  ```ts
  type LatexCompileOptions = { timeoutMs?: number; synctex?: boolean; onlyCached?: boolean; maxPdfBytes?: number };
  type LatexCompileInput = { mainTex: string; bib?: string; extraFiles?: Record<string, Uint8Array>; options?: LatexCompileOptions };
  type LatexCompileResult =
    | { ok: true; pdf: Uint8Array; synctex: Uint8Array | null; log: string; intermediates: Record<string, string> }
    | { ok: false; errors: CompileError[]; log: string };
  LatexCompileService.compile(input: LatexCompileInput): Promise<LatexCompileResult>
  ```
  Kontrak: file utama selalu `main.tex`, bib selalu `refs.bib` (dokumen harus `\addbibresource{refs.bib}`); `--only-cached` dan `--synctex` ON by default; binary dari `AQSHA_TECTONIC_BIN` (default `"tectonic"`); `intermediates` berisi `.aux/.bbl/.blg/.run.xml` (dipakai gate untuk bukti biber). Error codes: `latex_invalid_input`, `latex_compile_timeout`, `latex_bundle_missing`, `latex_compile_failed`, `latex_output_too_large`.

- [ ] **Step 1: Tulis failing test**

`packages/services/test/latex-compile-service.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { AppError } from "@aqsha/db";
import { LatexCompileService } from "../src/latex/compile.service";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const itest = hasToolchain ? test : test.skip;

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`expected AppError ${code}, tapi resolve`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
  }
}

describe("LatexCompileService.compile", () => {
  test("extraFiles dengan path traversal ditolak sebelum spawn", async () => {
    await expectAppError(
      LatexCompileService.compile({
        mainTex: "\\documentclass{article}\\begin{document}x\\end{document}",
        extraFiles: { "../evil.txt": new Uint8Array([1]) },
      }),
      "latex_invalid_input",
    );
  });

  itest(
    "doc minimal → ok, pdf non-kosong, synctex ada",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "Halo Aqsha.",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.pdf.byteLength).toBeGreaterThan(1000);
      expect(result.synctex).not.toBeNull();
      expect(result.log.length).toBeGreaterThan(0);
    },
    120_000,
  );

  itest(
    "doc dengan error LaTeX → union { ok:false, errors } dengan baris",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "\\undefinedmacro",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]?.message).toContain("Undefined control sequence");
      expect(result.errors[0]?.line).toBe(3);
    },
    120_000,
  );

  itest(
    "loop tak berujung → throw latex_compile_timeout",
    async () => {
      await expectAppError(
        LatexCompileService.compile({
          mainTex: [
            "\\documentclass{article}",
            "\\begin{document}",
            "\\loop\\iftrue\\repeat",
            "\\end{document}",
          ].join("\n"),
          options: { timeoutMs: 5000 },
        }),
        "latex_compile_timeout",
      );
    },
    60_000,
  );
});
```

- [ ] **Step 2: Jalankan test — harus FAIL**

Run: `cd packages/services && bun test test/latex-compile-service.test.ts`
Expected: FAIL (`Cannot find module '../src/latex/compile.service'`).

- [ ] **Step 3: Implementasi**

`packages/services/src/latex/compile.service.ts`:

```ts
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
```

Tambahkan ke `packages/services/src/latex/index.ts`:

```ts
export {
  LatexCompileService,
  type LatexCompileInput,
  type LatexCompileOptions,
  type LatexCompileResult,
} from "./compile.service";
```

Ganti blok re-export latex di `packages/services/src/index.ts` menjadi:

```ts
export {
  type CompileError,
  type CompileErrorSeverity,
  LatexCompileService,
  type LatexCompileInput,
  type LatexCompileOptions,
  type LatexCompileResult,
  parseSynctex,
  parseTexLog,
  runSandboxed,
  type SynctexData,
  synctexInverseLookup,
} from "./latex";
```

- [ ] **Step 4: Jalankan test — harus PASS**

Run: `cd packages/services && bun test test/latex-compile-service.test.ts`
Expected: 4 pass (atau 1 pass + 3 skip bila toolchain lokal tak ada — lihat fallback Task 1 Step 2), 0 fail. Prasyarat: cache Tectonic sudah warm dari Task 1 Step 4; kalau test gagal `latex_bundle_missing`, ulangi warm.

- [ ] **Step 5: Commit**

```bash
git add packages/services/src/latex packages/services/src/index.ts packages/services/test/latex-compile-service.test.ts
git commit -m "feat(services): LatexCompileService orkestrasi tectonic sandboxed"
```

---

### Task 7: Gate harness — 6 kriteria LOLOS

**Files:**
- Modify: `packages/services/package.json` (devDependency `pdf-lib`)
- Test: `packages/services/test/latex-gate.test.ts`

**Interfaces:**
- Consumes: `LatexCompileService.compile` (Task 6), `buildBibliographyFile` (Task 5), `parseSynctex` + `synctexInverseLookup` (Task 4), `AppError` dari `@aqsha/db`, `PDFDocument` dari `pdf-lib`.
- Produces: bukti terotomasi kriteria gate #1–#6. Nomor baris dokumen gate dikontrol oleh array `lines` di test (baris ke-8 = kalimat `\cite`).

- [ ] **Step 1: Tambah pdf-lib (hitung halaman di test)**

```bash
cd packages/services && bun add -d pdf-lib
```

- [ ] **Step 2: Tulis failing test**

`packages/services/test/latex-gate.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AppError } from "@aqsha/db";
import { PDFDocument } from "pdf-lib";
import { buildBibliographyFile } from "../src/citations/citation-bib";
import type { CslItem } from "../src/citations/citation-normalize";
import { LatexCompileService } from "../src/latex/compile.service";
import type { LatexCompileResult } from "../src/latex/compile.service";
import { parseSynctex, synctexInverseLookup } from "../src/latex/synctex";

const hasToolchain =
  Bun.which("tectonic") !== null &&
  (Bun.which("tectonic-biber") !== null || Bun.which("biber") !== null);
const itest = hasToolchain ? test : test.skip;

const PIXEL_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

const LIBRARY: Array<{ id: string; csl: CslItem }> = [
  {
    id: "cit-1",
    csl: {
      type: "book",
      title: "Metode Penelitian Kuantitatif, Kualitatif, dan R&D",
      author: [{ family: "Sugiyono", given: "Andi" }],
      issued: { "date-parts": [[2019]] },
      publisher: "Alfabeta",
    },
  },
  {
    id: "cit-2",
    csl: {
      type: "book",
      title: "Research Design: Qualitative, Quantitative, and Mixed Methods Approaches",
      author: [
        { family: "Creswell", given: "John W." },
        { family: "Creswell", given: "J. David" },
      ],
      issued: { "date-parts": [[2018]] },
      publisher: "SAGE",
    },
  },
  {
    id: "cit-3",
    csl: {
      type: "article-journal",
      title: "Pendekatan Campuran dalam Penelitian Pendidikan",
      author: [{ family: "Nurhaliza", given: "Siti" }],
      issued: { "date-parts": [[2021]] },
      "container-title": "Jurnal Ilmu Pendidikan",
      volume: "27",
      page: "101-115",
    },
  },
];

function buildGateDoc(keys: Record<string, string>): { tex: string; citeLine: number } {
  const lines = [
    "\\documentclass{article}",
    "\\usepackage{amsmath}",
    "\\usepackage{graphicx}",
    "\\usepackage[backend=biber,style=authoryear]{biblatex}",
    "\\addbibresource{refs.bib}",
    "\\begin{document}",
    "\\section{Pendahuluan}",
    `Metode penelitian kualitatif \\cite{${keys["cit-1"]}} berkembang \\cite{${keys["cit-2"]}}.`,
    "\\begin{equation}",
    "  E = mc^2",
    "\\end{equation}",
    "\\includegraphics[width=2cm]{pixel.png}",
    `Pendekatan campuran juga dipakai \\cite{${keys["cit-3"]}}.`,
    "\\newpage",
    "\\printbibliography",
    "\\end{document}",
  ];
  return { tex: lines.join("\n"), citeLine: 8 };
}

let gateRun: Promise<{
  keyById: Record<string, string>;
  citeLine: number;
  result: LatexCompileResult;
}> | null = null;

function compileGateDoc() {
  gateRun ??= (async () => {
    const { bib, keyById } = buildBibliographyFile(LIBRARY);
    const { tex, citeLine } = buildGateDoc(keyById);
    const result = await LatexCompileService.compile({
      mainTex: tex,
      bib,
      extraFiles: { "pixel.png": PIXEL_PNG },
    });
    return { keyById, citeLine, result };
  })();
  return gateRun;
}

describe("GATE Fase 4: pipeline compile LaTeX + sitasi", () => {
  itest(
    "kriteria 1 & 4: PDF non-kosong, 2 halaman, selesai dalam timeout default",
    async () => {
      const { result } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.pdf.byteLength).toBeGreaterThan(5000);
      const doc = await PDFDocument.load(result.pdf);
      expect(doc.getPageCount()).toBe(2);
    },
    180_000,
  );

  itest(
    "kriteria 2: biber jalan — .bbl memuat semua entri tersitasi, tanpa sitasi undefined",
    async () => {
      const { result, keyById } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const bbl = result.intermediates["main.bbl"] ?? "";
      for (const key of Object.values(keyById)) {
        expect(bbl).toContain(key);
      }
      expect(result.log).not.toMatch(/Citation .* undefined/);
      expect(result.log).not.toMatch(/Empty bibliography/);
    },
    180_000,
  );

  itest(
    "kriteria 3: SyncTeX ada dan inverse-map kembali ke baris sumber yang benar",
    async () => {
      const { result, citeLine } = await compileGateDoc();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.synctex).not.toBeNull();
      if (!result.synctex) return;
      const data = parseSynctex(result.synctex);
      const mainTags = new Set(
        [...data.inputs.entries()]
          .filter(([, p]) => p.endsWith("main.tex"))
          .map(([tag]) => tag),
      );
      const anchor = data.records.find(
        (r) => r.page === 1 && mainTags.has(r.tag) && Math.abs(r.line - citeLine) <= 1,
      );
      expect(anchor).toBeDefined();
      if (!anchor) return;
      const found = synctexInverseLookup(data, {
        page: 1,
        x: anchor.x + 1000,
        y: anchor.y,
      });
      expect(found?.file.endsWith("main.tex")).toBe(true);
      expect(Math.abs((found?.line ?? 0) - citeLine)).toBeLessThanOrEqual(2);
    },
    180_000,
  );

  itest(
    "kriteria 5: \\write18 TIDAK dieksekusi",
    async () => {
      const marker = join(tmpdir(), `aqsha-gate-write18-${process.pid}`);
      await rm(marker, { force: true });
      await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          `\\immediate\\write18{touch ${marker}}`,
          "aman",
          "\\end{document}",
        ].join("\n"),
      });
      expect(existsSync(marker)).toBe(false);
    },
    120_000,
  );

  itest(
    "kriteria 6: error LaTeX → errors[] terstruktur (line + pesan), bukan crash",
    async () => {
      const result = await LatexCompileService.compile({
        mainTex: [
          "\\documentclass{article}",
          "\\begin{document}",
          "\\undefinedmacro",
          "\\end{document}",
        ].join("\n"),
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors[0]?.line).toBe(3);
      expect(result.errors[0]?.message).toContain("Undefined control sequence");
    },
    120_000,
  );
});
```

- [ ] **Step 3: Jalankan gate — harus PASS**

Run: `cd packages/services && bun test test/latex-gate.test.ts`
Expected: 5 pass (atau 5 skip tanpa toolchain lokal), 0 fail.

Catatan debugging bila kriteria 3 gagal: dump `result.log` dan isi synctex (`gunzip`), periksa apakah record baris `citeLine` memang ada — bila Tectonic menandai baris paragraf berbeda (word-wrap), toleransi sudah ±1/±2; kegagalan di luar itu = temuan gate yang harus masuk laporan, bukan untuk ditutupi dengan mengendurkan assertion.

- [ ] **Step 4: Jalankan seluruh suite services (pastikan tak ada regresi)**

Run: `cd packages/services && bun test`
Expected: semua pass/skip, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add packages/services/package.json packages/services/test/latex-gate.test.ts bun.lock
git commit -m "test(services): gate harness pipeline latex — 6 kriteria lolos"
```

(Kalau nama lockfile berbeda, `git status` dulu dan stage lockfile yang berubah.)

---

### Task 8: Bukti Linux + offline bundle (Docker)

Menjawab dua risiko yang tak bisa dibuktikan di macOS: bundle offline `--only-cached` di container tanpa jaringan, dan `Bun.spawn` + ulimit di Linux.

**Files:**
- Create: `infra/latex-compile/Dockerfile`
- Create: `infra/latex-compile/Dockerfile.dockerignore`

**Interfaces:**
- Consumes: fixtures Task 1, seluruh test Task 2–7, `bun.lock` root.
- Produces: image `aqsha-latex-gate` yang berhasil build = bukti; langkah `RUN --network=none … bun test` menjalankan gate harness yang sama di Ubuntu 22.04 tanpa jaringan.

- [ ] **Step 1: Tulis Dockerfile**

`infra/latex-compile/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
# Bukti gate Fase 4 di Linux: tectonic musl + biber 2.17 (wajib persis — bundle
# default tectonic 0.16.x memuat biblatex 3.17) + bun, cache bundle di-warm saat
# build, lalu gate test dijalankan TANPA jaringan.
FROM ubuntu:22.04

ARG TECTONIC_VERSION=0.16.9
ARG BUN_VERSION=1.3.10

RUN apt-get update \
 && apt-get install -y --no-install-recommends biber ca-certificates curl unzip \
 && rm -rf /var/lib/apt/lists/* \
 && biber --version | grep -q "2\.17"

RUN arch="$(dpkg --print-architecture)"; \
    case "$arch" in \
      amd64) triple=x86_64-unknown-linux-musl ;; \
      arm64) triple=aarch64-unknown-linux-musl ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-${triple}.tar.gz" \
      | tar -xz -C /usr/local/bin tectonic \
 && tectonic --version

RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"
ENV PATH="/root/.bun/bin:${PATH}" \
    TECTONIC_CACHE_DIR=/opt/tectonic-cache \
    TECTONIC_UNTRUSTED_MODE=1

WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile

# Warm cache bundle — satu-satunya langkah yang boleh menyentuh jaringan bundle.
RUN mkdir /tmp/warm \
 && cp packages/services/test/fixtures/latex/sample-main.tex /tmp/warm/main.tex \
 && cp packages/services/test/fixtures/latex/sample-refs.bib /tmp/warm/refs.bib \
 && cp packages/services/test/fixtures/latex/pixel.png /tmp/warm/ \
 && cd /tmp/warm \
 && tectonic --untrusted --synctex --keep-logs --keep-intermediates --outdir out main.tex \
 && test -s out/main.pdf && test -s out/main.synctex.gz && test -s out/main.bbl \
 && rm -rf /tmp/warm

# Bukti inti: gate harness lengkap berjalan TANPA jaringan (cache-only).
RUN --network=none cd packages/services \
 && bun test test/latex-gate.test.ts test/latex-compile-service.test.ts test/latex-runner.test.ts
```

`infra/latex-compile/Dockerfile.dockerignore`:

```
**/node_modules
**/.git
**/dist
**/.svelte-kit
**/.next
**/.turbo
**/build
**/*.log
```

- [ ] **Step 2: Build (context = root repo; butuh Docker Desktop jalan)**

Run: `docker build -f infra/latex-compile/Dockerfile -t aqsha-latex-gate .`
Expected: build sukses (±5–10 menit: bun install + fetch bundle). Kegagalan di step `--network=none` = temuan gate serius (offline bundle tak lengkap / Bun.spawn bermasalah di Linux) — catat untuk laporan, jangan ditambal dengan menghapus `--network=none`.

Kalau `RUN --network=none` ditolak builder lama: `docker buildx build` dengan driver default, atau update Docker Desktop; opsi terakhir, pisahkan langkah test ke `docker run --network=none aqsha-latex-gate ...` dan catat deviasinya.

- [ ] **Step 3: Commit**

```bash
git add infra/latex-compile/
git commit -m "infra: bukti gate compile latex offline di ubuntu 22.04 (tectonic+biber+bun)"
```

---

### Task 9: Verifikasi penuh + laporan GO/NO-GO

**Files:**
- Create: `docs/superpowers/specs/2026-07-18-research-first-phase4-latex-gate-report.md`

**Interfaces:**
- Consumes: hasil Task 1–8.
- Produces: keputusan GO/NO-GO terdokumentasi untuk membuka Fase 5.

- [ ] **Step 1: Verifikasi penuh**

```bash
cd packages/services && bun test          # seluruh suite services
cd ../.. && bun run typecheck             # semua workspace
bun run build:dist                        # pastikan entry tsup baru ter-build
```

Expected: 0 fail; typecheck bersih; `packages/services/dist/latex/index.js` ada.

- [ ] **Step 2: Tulis laporan gate**

`docs/superpowers/specs/2026-07-18-research-first-phase4-latex-gate-report.md`, isi nyata (bukan template kosong) dengan struktur:

```markdown
# Fase 4 — Laporan gate pipeline compile LaTeX + sitasi

Keputusan: **GO / NO-GO** (tanggal)

## Hasil kriteria
| # | Kriteria | Lokal (macOS) | Docker (Ubuntu 22.04) |
|---|---|---|---|
| 1 | PDF non-kosong, 2 halaman | PASS/FAIL/SKIP | PASS/FAIL |
| 2 | Daftar pustaka biblatex (biber) | … | … |
| 3 | SyncTeX inverse-map | … | … |
| 4 | Selesai dalam timeout | … | … |
| 5 | \write18 diblok | … | … |
| 6 | errors[] terstruktur | … | … |

## Temuan & batas yang diketahui
- Versi terpasang: tectonic X, biber Y (lokal); tectonic X, biber Y (image).
- biber WAJIB 2.17 selama bundle default = TL2022/biblatex 3.17 — pin di image; pantau saat upgrade Tectonic.
- --untrusted TIDAK menyandbox FS read (\input path absolut tembus) → penempatan
  produksi Fase 5/6 wajib container sandbox (read-only rootfs, no network).
- -Z deterministic-mode dilarang (merusak SyncTeX).
- Env knob: AQSHA_TECTONIC_BIN, TECTONIC_CACHE_DIR.

## Deviasi dari plan
(daftar, atau "tidak ada")
```

Isi tabel dari hasil test nyata Task 7 (lokal) dan Task 8 (Docker). Changelog produk: tidak perlu entri (bukan perubahan user-facing).

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-18-research-first-phase4-latex-gate-report.md
git commit -m "docs: laporan gate fase 4 pipeline compile latex"
```

---

## Self-Review (sudah dijalankan atas plan ini)

- **Cakupan spec:** komponen 1–5 spec → Task 6 (service), Task 3 (runner), Task 5 (bib export), Task 2 (log parser), Task 7 (harness). Sandbox: timeout ✓ (runner+service), cap memori ✓ (`ulimit -v`, efektif Linux, diakui no-op di macOS), cap output ✓ (`maxOutputBytes` + `maxPdfBytes`), no-network ✓ (`--only-cached` + bukti `--network=none`), bundle offline ✓ (Task 1 Step 6 + Task 8); FS read-only per-job TIDAK bisa dipenuhi level proses (temuan riset: Tectonic tak membatasi read) — dieksplisitkan di Global Constraints + laporan gate, enforcement OS-level ditunda ke penempatan produksi sesuai bagian "Penempatan produksi (ditunda)" spec. Error handling union vs throw ✓. Kriteria LOLOS 1–6 ✓ (Task 7). Risiko #1–#4 spec masing-masing dibunuh di Task 1, Task 7 kriteria 3, Task 8, Task 3+8.
- **Placeholder:** tidak ada TBD/TODO; semua step berisi kode/perintah utuh.
- **Konsistensi tipe/nama:** `CompileError` (T2) dipakai T6/T7; `runSandboxed` (T3) dipakai T6; `buildBibliographyFile` (T5) dipakai T7; `parseSynctex`/`synctexInverseLookup` (T4) dipakai T7; kunci fixture `sugiyono2019/creswell2018/nurhaliza2021` konsisten antara `sample-refs.bib` (T1) dan hasil `generateBibKeys` di gate (T7).
