import {
  AnalysisResultBlockRepo,
  type AnalysisResultBlockRow,
  AnalysisSandboxRepo,
  type AnalysisSandbox,
  ArtifactContentRepo,
  ArtifactRepo,
  type DbOrTx,
  type StagedDataset,
  throwAppError,
} from "@aqsha/db";
import { parseStatsGroup } from "@aqsha/chat-core/stats-viz";
import type { Sandbox } from "@daytona/sdk";
import {
  CODE_RUN_HEAVY_TIMEOUT_SECONDS,
  CODE_RUN_TIMEOUT_SECONDS,
  createStatsSandbox,
  deleteSandbox,
  findSandbox,
} from "../clients/daytona";
import { StorageService } from "../storage.service";
import { analysisCatalogEntry } from "./catalog";

/**
 * AnalysisService — sandbox statistik Daytona per-thread (plan §4.2C).
 * LLM tidak menghitung: semua angka + verdict datang dari template deterministik
 * `aqsha_stats` (packages/stats-py) yang dieksekusi via `codeRun` IN-PROCESS
 * (bukan subprocess — chart capture Daytona hanya menangkap `plt.show()` di sesi
 * codeRun). Billing (gate + debit) hidup di tool agent, bukan di sini.
 */

const DATASET_DIR = "/home/daytona/datasets";
/** Marker pemisah stdout bebas (warnings) vs JSON hasil — baris terakhir setelah marker. */
const RESULT_MARKER = "__AQSHA_STATS_RESULT__";

/** Tipe artifact yang bisa di-stage sebagai dataset tabular. */
const DATASET_ARTIFACT_TYPES = new Set(["csv", "spreadsheet"]);

export type AnalysisChart = { png: string; title?: string; type?: string };

export type AnalysisRunResult =
  | { ok: true; result: Record<string, unknown>; charts: AnalysisChart[] }
  | { ok: false; error: { code: string; message: string } };

/** Format ekspor deliverable (fase 5). */
export type AnalysisExportFormat = "docx" | "xlsx" | "sav";

export type AnalysisExportFile = {
  format: AnalysisExportFormat;
  fileName: string;
  mimeType: string;
  /** Tipe artifact pustaka (docx = dokumen; xlsx/sav = data). */
  artifactType: "docx" | "spreadsheet";
  bytes: Uint8Array;
};

export type AnalysisExportResult =
  | {
      ok: true;
      files: AnalysisExportFile[];
      /** Format yang diminta+dicoba tapi tak menghasilkan file (mis. tak ada hasil relevan). */
      missingFormats?: AnalysisExportFormat[];
    }
  | { ok: false; error: { code: string; message: string } };

const EXPORT_DIR = "/home/daytona/exports";
const EXPORT_SPEC: Record<
  AnalysisExportFormat,
  { fileName: string; mimeType: string; artifactType: "docx" | "spreadsheet" }
> = {
  docx: {
    fileName: "hasil-analisis.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    artifactType: "docx",
  },
  xlsx: {
    fileName: "hasil-analisis.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    artifactType: "spreadsheet",
  },
  sav: {
    fileName: "dataset-olahan.sav",
    mimeType: "application/x-spss-sav",
    artifactType: "spreadsheet",
  },
};

/** Ekstensi dataset yang dikenali sandbox (`aqsha_stats.io.load_dataset` dispatch by suffix). */
const DATASET_EXTENSIONS = [".xlsx", ".xls", ".sav", ".dta", ".csv"] as const;

function datasetPathFor(
  artifactId: string,
  fileName: string | null,
  title: string | null,
  artifactType: string,
): string {
  for (const name of [fileName, title]) {
    const lower = name?.toLowerCase() ?? "";
    const extension = DATASET_EXTENSIONS.find((ext) => lower.endsWith(ext))?.slice(1);
    if (extension) return `${DATASET_DIR}/${artifactId}.${extension}`;
  }
  // Nama tanpa ekstensi dikenali → default per tipe artifact: spreadsheet (XLSX bytes) TIDAK boleh
  // jatuh ke `.csv` (load_dataset akan mem-parse biner sebagai CSV → gagal), hanya CSV yang boleh.
  const fallback = artifactType === "spreadsheet" ? "xlsx" : "csv";
  return `${DATASET_DIR}/${artifactId}.${fallback}`;
}

async function loadDatasetBytes(
  db: DbOrTx,
  ownerUserId: string,
  artifact: { id: string; storageR2Key: string | null },
): Promise<Uint8Array> {
  if (artifact.storageR2Key) return StorageService.readBytes(artifact.storageR2Key);
  // Dataset tanpa blob (mis. CSV buatan agent) → body text inline/offloaded.
  const content = await ArtifactContentRepo.findByArtifact(db, ownerUserId, artifact.id);
  const inline = content?.plainText ?? content?.markdown;
  if (inline) return new TextEncoder().encode(inline);
  if (content?.plainTextR2Key) {
    return StorageService.readBytes(content.plainTextR2Key);
  }
  throwAppError({
    message: "Dataset tidak punya konten yang bisa dibaca.",
    code: "analysis_dataset_empty",
    severity: "warning",
  });
}

async function requireDatasetArtifact(db: DbOrTx, ownerUserId: string, artifactId: string) {
  const artifact = await ArtifactRepo.findById(db, artifactId);
  if (!artifact || artifact.ownerUserId !== ownerUserId || artifact.status !== "active") {
    throwAppError({
      message: "Dataset tidak ditemukan di pustaka kamu.",
      code: "analysis_dataset_not_found",
      severity: "warning",
    });
  }
  if (!DATASET_ARTIFACT_TYPES.has(artifact.artifactType)) {
    throwAppError({
      message: "Artifact ini bukan dataset tabular. Unggah CSV atau XLSX.",
      code: "analysis_dataset_not_tabular",
      severity: "warning",
    });
  }
  return artifact;
}

/** Python runner: eksekusi analisis in-process + cetak JSON hasil setelah marker. */
function runnerCode(analysisId: string, dataPath: string, args: Record<string, unknown>): string {
  const argsB64 = Buffer.from(JSON.stringify(args), "utf8").toString("base64");
  return [
    "import base64, json",
    "from aqsha_stats import run_analysis_safe",
    `args = json.loads(base64.b64decode("${argsB64}").decode("utf-8"))`,
    `result = run_analysis_safe(${JSON.stringify(analysisId)}, ${JSON.stringify(dataPath)}, args)`,
    `print(${JSON.stringify(RESULT_MARKER)})`,
    // `default=str` sejajar `freeformRunnerCode`: nilai sisa yang lolos sanitasi `r3()` (mis.
    // Timestamp/Decimal di sel tabel) di-string-kan alih-alih meledakkan json.dumps SETELAH marker
    // tercetak — kalau tidak, analisis yang SUKSES salah dilaporkan gagal (parse tail JSON gagal).
    "print(json.dumps(result, ensure_ascii=False, default=str))",
  ].join("\n");
}

/**
 * Runner codegen fallback (fase 4) — kode Python bebas dari LLM. Konvensi: dataset sudah
 * dimuat ke `df` (+ `DATA_PATH`), pandas/numpy/plt tersedia; kode WAJIB mengisi variabel
 * `result` (dict JSON-serializable, idealnya `{"tables": [...], "decisions": [...]}`); chart
 * lewat `plt.show()`. Sandbox `networkBlockAll` + timeout ketat = pagar eksekusi. Kode
 * diselipkan apa adanya: syntax error → codeRun exit non-nol tanpa marker → caller lapor gagal
 * (traceback di stdout tail) supaya model bisa memperbaiki.
 */
function freeformRunnerCode(dataPath: string, code: string): string {
  return [
    "import base64, json",
    "import pandas as pd",
    "import numpy as np",
    "import matplotlib",
    "import matplotlib.pyplot as plt",
    "from aqsha_stats.io import load_dataset",
    `DATA_PATH = ${JSON.stringify(dataPath)}`,
    "df = load_dataset(DATA_PATH)",
    "result = None",
    "# ---- kode analisis kustom (LLM) ----",
    code,
    "# ---- akhir kode analisis kustom ----",
    `print(${JSON.stringify(RESULT_MARKER)})`,
    "print(json.dumps(result if result is not None else {}, ensure_ascii=False, default=str))",
  ].join("\n");
}

/**
 * Pastikan sandbox berjalan. `started` → langsung pakai. State lain (stopped) → `start()`.
 * State terminal/error (`error`/`build_failed`/`destroyed`/`stopping`, dll.) membuat `start()`
 * melempar → return `false` supaya caller mengganti sandbox (bukan macet selamanya di id rusak).
 */
async function ensureSandboxStarted(sandbox: Sandbox): Promise<boolean> {
  if (sandbox.state === "started") return true;
  try {
    await sandbox.start();
    return true;
  } catch {
    return false;
  }
}

function parseRunnerStdout(stdout: string): Record<string, unknown> | null {
  const markerAt = stdout.lastIndexOf(RESULT_MARKER);
  if (markerAt === -1) return null;
  const jsonText = stdout.slice(markerAt + RESULT_MARKER.length).trim();
  try {
    return JSON.parse(jsonText) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const EXPORT_PAYLOAD_PATH = "/home/daytona/export-payload.json";

/** Runner ekspor (fase 5): baca payload JSON → tulis file → cetak {format: path}. */
function exporterCode(formats: string[], dataPath: string | null): string {
  return [
    "import json, os",
    "from aqsha_stats.export import export_files",
    `with open(${JSON.stringify(EXPORT_PAYLOAD_PATH)}, encoding="utf-8") as _f: payload = json.load(_f)`,
    `formats = ${JSON.stringify(formats)}`,
    `data_path = ${dataPath ? JSON.stringify(dataPath) : "None"}`,
    `os.makedirs(${JSON.stringify(EXPORT_DIR)}, exist_ok=True)`,
    `out = export_files(payload, formats, data_path, ${JSON.stringify(EXPORT_DIR)})`,
    `print(${JSON.stringify(RESULT_MARKER)})`,
    "print(json.dumps(out))",
  ].join("\n");
}

type ExportGroup = {
  title: string;
  tables: Array<{ title: string; columns: string[]; rows: unknown[][]; notes: string[] }>;
  decisions: Array<{ label: string; verdict: string; interpretation: string }>;
  figures: Array<{ png: string; caption: string }>;
};

/** Grup blok tersimpan (baris `analysis_result_blocks`) → payload ekspor (tabel/verdict/figur). */
function buildExportGroup(row: AnalysisResultBlockRow): ExportGroup | null {
  const group = parseStatsGroup({
    v: 1,
    runKey: row.runKey,
    analysis: row.analysis,
    title: row.title,
    blocks: row.blocks,
  });
  if (!group) return null;
  const tables: ExportGroup["tables"] = [];
  const decisions: ExportGroup["decisions"] = [];
  const figures: ExportGroup["figures"] = [];
  for (const block of group.blocks) {
    if (block.type === "stats-table") {
      tables.push({
        title: block.table.title,
        columns: block.table.columns,
        rows: block.table.rows,
        notes: block.table.notes,
      });
    } else if (block.type === "stats-decision") {
      for (const d of block.decisions) {
        decisions.push({ label: d.label, verdict: d.verdict, interpretation: d.interpretation });
      }
    } else if (block.type === "stats-figure") {
      figures.push({ png: block.png, caption: block.caption });
    }
  }
  return { title: group.title, tables, decisions, figures };
}

/** Chart PNG (base64 + metadata) yang di-capture Daytona dari `plt.show()`. */
function extractCharts(execution: {
  artifacts?: { charts?: Array<{ png?: string; title?: string; type?: string }> };
}): AnalysisChart[] {
  return (execution.artifacts?.charts ?? []).flatMap((chart) =>
    chart.png ? [{ png: chart.png, title: chart.title, type: chart.type }] : [],
  );
}

export const AnalysisService = {
  /**
   * Get-or-create sandbox per thread (1 row/thread, unique index). Lazy `start()`
   * bila auto-stop; bila sandbox sudah dihapus di Daytona → create baru + reset
   * staged datasets (file ikut hilang bersama sandbox).
   */
  async ensureSandbox(
    db: DbOrTx,
    scope: { ownerUserId: string; threadId: string },
  ): Promise<{ record: AnalysisSandbox; sandbox: Sandbox }> {
    const now = Date.now();
    const existing = await AnalysisSandboxRepo.findByThread(db, scope.threadId);
    if (existing && existing.ownerUserId !== scope.ownerUserId) {
      throwAppError({
        message: "Sandbox analisis thread ini bukan milik kamu.",
        code: "analysis_sandbox_forbidden",
        status: 403,
      });
    }

    if (existing) {
      const sandbox = await findSandbox(existing.sandboxId);
      // Ada DAN bisa dijalankan → reuse. Hilang / rusak (start gagal) → ganti.
      if (sandbox && (await ensureSandboxStarted(sandbox))) {
        await AnalysisSandboxRepo.touch(db, existing.id, now);
        return { record: { ...existing, lastUsedAt: now }, sandbox };
      }
      const replacement = await createStatsSandbox({
        "aqsha.owner": scope.ownerUserId,
        "aqsha.thread": scope.threadId,
      });
      await AnalysisSandboxRepo.replaceSandbox(db, existing.id, replacement.id, now);
      return {
        record: { ...existing, sandboxId: replacement.id, stagedDatasets: [], lastUsedAt: now },
        sandbox: replacement,
      };
    }

    const sandbox = await createStatsSandbox({
      "aqsha.owner": scope.ownerUserId,
      "aqsha.thread": scope.threadId,
    });
    const record: AnalysisSandbox = {
      id: crypto.randomUUID(),
      ownerUserId: scope.ownerUserId,
      threadId: scope.threadId,
      sandboxId: sandbox.id,
      status: "active",
      stagedDatasets: [],
      createdAt: now,
      lastUsedAt: now,
    };
    const won = await AnalysisSandboxRepo.insert(db, {
      id: record.id,
      ownerUserId: record.ownerUserId,
      threadId: record.threadId,
      sandboxId: record.sandboxId,
      now,
    });
    if (!won) {
      // Tool-call paralel di thread yang sama menang race insert → buang sandbox kita
      // (kalau tidak, ia bocor selamanya) lalu adopsi pemenang (row kini pasti ada).
      await deleteSandbox(sandbox.id).catch(() => {});
      return this.ensureSandbox(db, scope);
    }
    return { record, sandbox };
  },

  /**
   * Upload bytes dataset ke sandbox (idempoten: artifact yang sudah staged tidak
   * di-re-upload — file persist across stop). Return path file di sandbox.
   */
  async stageDataset(
    db: DbOrTx,
    scope: { ownerUserId: string; threadId: string; artifactId: string },
  ): Promise<{ record: AnalysisSandbox; sandbox: Sandbox; dataset: StagedDataset }> {
    const artifact = await requireDatasetArtifact(db, scope.ownerUserId, scope.artifactId);
    const { record, sandbox } = await this.ensureSandbox(db, scope);

    const already = record.stagedDatasets.find((d) => d.artifactId === artifact.id);
    if (already) return { record, sandbox, dataset: already };

    const bytes = await loadDatasetBytes(db, scope.ownerUserId, artifact);
    const dataset: StagedDataset = {
      artifactId: artifact.id,
      path: datasetPathFor(artifact.id, artifact.fileName, artifact.title, artifact.artifactType),
      fileName: artifact.fileName ?? artifact.title,
      stagedAt: Date.now(),
    };
    await sandbox.fs.uploadFile(Buffer.from(bytes), dataset.path);
    const stagedDatasets = [...record.stagedDatasets, dataset];
    await AnalysisSandboxRepo.setStagedDatasets(db, record.id, stagedDatasets, dataset.stagedAt);
    return { record: { ...record, stagedDatasets }, sandbox, dataset };
  },

  /**
   * Jalankan satu analisis dari katalog terhadap dataset (stage bila perlu).
   * Error analisis (kolom tak ada, args salah) = return union `ok: false` supaya
   * agent bisa mengoreksi mapping kolom — bukan throw.
   */
  async runAnalysis(
    db: DbOrTx,
    scope: {
      ownerUserId: string;
      threadId: string;
      artifactId: string;
      analysisId: string;
      args: Record<string, unknown>;
    },
  ): Promise<AnalysisRunResult> {
    const entry = analysisCatalogEntry(scope.analysisId);
    if (!entry) {
      return {
        ok: false,
        error: {
          code: "analysis_unknown",
          message: `Analisis "${scope.analysisId}" tidak ada di katalog. Panggil list_analyses untuk daftar id yang valid.`,
        },
      };
    }
    const missing = entry.args.filter((a) => a.required && scope.args[a.name] === undefined);
    if (missing.length > 0) {
      return {
        ok: false,
        error: {
          code: "analysis_args_missing",
          message: `Argumen wajib belum diisi: ${missing.map((a) => a.name).join(", ")}.`,
        },
      };
    }

    const { sandbox, dataset } = await this.stageDataset(db, scope);
    const timeout = entry.heavy ? CODE_RUN_HEAVY_TIMEOUT_SECONDS : CODE_RUN_TIMEOUT_SECONDS;
    const execution = await sandbox.process.codeRun(
      runnerCode(entry.id, dataset.path, scope.args),
      undefined,
      timeout,
    );

    const stdout = execution.artifacts?.stdout ?? execution.result ?? "";
    const parsed = parseRunnerStdout(stdout);
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: "analysis_execution_failed",
          message: `Eksekusi analisis gagal (exit ${execution.exitCode}): ${stdout.slice(-400) || "output kosong"}`,
        },
      };
    }
    const errorPayload = parsed.error as { code?: string; message?: string } | undefined;
    if (errorPayload) {
      return {
        ok: false,
        error: {
          code: errorPayload.code ?? "analysis_error",
          message: errorPayload.message ?? "Analisis gagal tanpa pesan.",
        },
      };
    }

    return { ok: true, result: parsed, charts: extractCharts(execution) };
  },

  /**
   * Codegen fallback (fase 4) — jalankan kode Python bebas dari LLM di sandbox thread ini
   * (dataset di-stage bila perlu). Guardrail: `networkBlockAll` (bawaan sandbox) + timeout
   * ketat + konvensi `result` JSON. Error runtime/syntax = `ok: false` dengan tail stdout
   * (traceback) supaya model bisa memperbaiki, tanpa kehilangan kredit (debit on-success di tool).
   */
  async runFreeformPython(
    db: DbOrTx,
    scope: { ownerUserId: string; threadId: string; artifactId: string; code: string },
  ): Promise<AnalysisRunResult> {
    const { sandbox, dataset } = await this.stageDataset(db, scope);
    const execution = await sandbox.process.codeRun(
      freeformRunnerCode(dataset.path, scope.code),
      undefined,
      CODE_RUN_TIMEOUT_SECONDS,
    );
    const stdout = execution.artifacts?.stdout ?? execution.result ?? "";
    const parsed = parseRunnerStdout(stdout);
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: "analysis_code_failed",
          message: `Eksekusi kode gagal (exit ${execution.exitCode}): ${stdout.slice(-600) || "output kosong"}`,
        },
      };
    }
    return { ok: true, result: parsed, charts: extractCharts(execution) };
  },

  /** Profil dataset (gratis) — analisis `profile` dari katalog. */
  async profileDataset(
    db: DbOrTx,
    scope: { ownerUserId: string; threadId: string; artifactId: string },
  ): Promise<AnalysisRunResult> {
    return this.runAnalysis(db, { ...scope, analysisId: "profile", args: {} });
  },

  /**
   * Persist grup blok hasil (tabel/verdict/figur) di luar teks pesan — FE me-join
   * per-thread untuk merender penanda `{{stats:<runKey>}}`. Idempoten pada
   * `(threadId, runKey)`: retry/re-run tool (toolCallId → runKey sama) menimpa baris
   * yang sama, bukan menggandakan. `blocks` = `StatsBlock[]` terserialisasi (kontrak
   * `@aqsha/chat-core/stats-viz`; schema DB sengaja tak depend chat-core).
   */
  async saveResultBlocks(
    db: DbOrTx,
    scope: {
      ownerUserId: string;
      threadId: string;
      toolCallId: string;
      runKey: string;
      analysis: string;
      title: string;
      blocks: unknown[];
      custom?: boolean;
      code?: string | null;
    },
  ): Promise<void> {
    await AnalysisResultBlockRepo.upsert(db, {
      id: crypto.randomUUID(),
      ownerUserId: scope.ownerUserId,
      threadId: scope.threadId,
      toolCallId: scope.toolCallId,
      runKey: scope.runKey,
      analysis: scope.analysis,
      title: scope.title,
      blocks: scope.blocks,
      custom: scope.custom,
      code: scope.code,
      now: Date.now(),
    });
  },

  /** Semua grup blok hasil thread (urut createdAt) — dibaca route FE per-thread. */
  async listResultBlocks(
    db: DbOrTx,
    scope: { threadId: string; ownerUserId: string },
  ): Promise<AnalysisResultBlockRow[]> {
    return AnalysisResultBlockRepo.listByThread(db, scope);
  },

  /**
   * Ekspor hasil analisis thread ke file unduhan (fase 5): .docx (tabel + interpretasi Bab 4),
   * .xlsx (tabel mentah), .sav (dataset untuk SPSS). Dibangun di sandbox dari blok yang sudah
   * dipersist (`analysis_result_blocks`) → byte diunduh untuk disimpan sbg artifact pustaka oleh
   * caller (tool). `.sav` butuh `datasetArtifactId` (dataset di-stage lalu ditulis ulang .sav).
   */
  async exportResults(
    db: DbOrTx,
    scope: {
      ownerUserId: string;
      threadId: string;
      formats: AnalysisExportFormat[];
      datasetArtifactId?: string;
    },
  ): Promise<AnalysisExportResult> {
    const formats = [...new Set(scope.formats)].filter(
      (f): f is AnalysisExportFormat => f in EXPORT_SPEC,
    );
    if (formats.length === 0) {
      return { ok: false, error: { code: "export_no_format", message: "Format ekspor tidak dikenal (pilih docx/xlsx/sav)." } };
    }

    const rows = await AnalysisResultBlockRepo.listByThread(db, {
      threadId: scope.threadId,
      ownerUserId: scope.ownerUserId,
    });
    const groups = rows
      .map(buildExportGroup)
      .filter((g): g is ExportGroup => g !== null);

    // `.sav` (dataset) butuh datasetArtifactId; format dokumen (docx/xlsx) butuh minimal 1 hasil.
    // Format yang syaratnya tak terpenuhi DIBUANG (bukan menggagalkan seluruh batch) supaya
    // permintaan campuran tetap menghasilkan file yang bisa dibuat.
    const docFormats = formats.filter((f) => f !== "sav");
    const wantsSav = formats.includes("sav");
    const canSav = wantsSav && Boolean(scope.datasetArtifactId);
    const runFormats: AnalysisExportFormat[] = [
      ...(groups.length > 0 ? docFormats : []),
      ...(canSav ? (["sav"] as const) : []),
    ];
    if (runFormats.length === 0) {
      const reason =
        wantsSav && !scope.datasetArtifactId
          ? "Ekspor .sav butuh dataset — sebutkan artifactId dataset yang mau disimpan sebagai file SPSS."
          : "Belum ada hasil analisis untuk diekspor. Jalankan minimal satu uji dulu.";
      return { ok: false, error: { code: "export_empty", message: reason } };
    }

    let sandbox: Sandbox;
    let dataPath: string | null = null;
    if (canSav) {
      const staged = await this.stageDataset(db, {
        ownerUserId: scope.ownerUserId,
        threadId: scope.threadId,
        artifactId: scope.datasetArtifactId as string,
      });
      sandbox = staged.sandbox;
      dataPath = staged.dataset.path;
    } else {
      sandbox = (await this.ensureSandbox(db, scope)).sandbox;
    }

    const payload = { title: "Hasil Analisis Data", groups };
    await sandbox.fs.uploadFile(
      Buffer.from(JSON.stringify(payload), "utf8"),
      EXPORT_PAYLOAD_PATH,
    );
    const execution = await sandbox.process.codeRun(
      exporterCode(runFormats, dataPath),
      undefined,
      CODE_RUN_HEAVY_TIMEOUT_SECONDS,
    );
    const stdout = execution.artifacts?.stdout ?? execution.result ?? "";
    const parsed = parseRunnerStdout(stdout);
    if (!parsed) {
      return {
        ok: false,
        error: {
          code: "export_failed",
          message: `Ekspor gagal (exit ${execution.exitCode}): ${stdout.slice(-400) || "output kosong"}`,
        },
      };
    }

    // Unduhan tiap file independen → paralel (bukan seri) supaya wall-clock = maks, bukan jumlah.
    const downloads = await Promise.all(
      runFormats
        .filter((format) => typeof parsed[format] === "string")
        .map(async (format) => {
          const buf = await sandbox.fs.downloadFile(parsed[format] as string);
          const spec = EXPORT_SPEC[format];
          return {
            format,
            fileName: spec.fileName,
            mimeType: spec.mimeType,
            artifactType: spec.artifactType,
            bytes: new Uint8Array(buf),
          };
        }),
    );
    const files: AnalysisExportFile[] = downloads;
    if (files.length === 0) {
      return { ok: false, error: { code: "export_empty_output", message: "Tidak ada file yang berhasil dibuat." } };
    }
    // Format yang diminta (setelah validasi EXPORT_SPEC) tapi tak jadi file → dilaporkan ke
    // caller supaya user tahu (bukan diam-diam hilang). Pakai `formats` (koleksi lengkap yang
    // diminta), bukan `runFormats`, agar format yang DIBUANG karena tak eligible (mis. `sav`
    // tanpa dataset, atau format dokumen tanpa hasil) juga masuk missingFormats.
    const produced = new Set(files.map((f) => f.format));
    const missingFormats = formats.filter((format) => !produced.has(format));
    return {
      ok: true,
      files,
      ...(missingFormats.length > 0 ? { missingFormats } : {}),
    };
  },
};
