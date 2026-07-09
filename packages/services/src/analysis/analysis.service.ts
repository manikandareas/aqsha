import {
  AnalysisSandboxRepo,
  type AnalysisSandbox,
  ArtifactContentRepo,
  ArtifactRepo,
  type DbOrTx,
  type StagedDataset,
  throwAppError,
} from "@aqsha/db";
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

function datasetPathFor(artifactId: string, fileName: string | null): string {
  const extension = fileName?.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
  return `${DATASET_DIR}/${artifactId}.${extension}`;
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
    "print(json.dumps(result, ensure_ascii=False))",
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
      path: datasetPathFor(artifact.id, artifact.fileName),
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

    const charts: AnalysisChart[] = (execution.artifacts?.charts ?? []).flatMap((chart) =>
      chart.png ? [{ png: chart.png, title: chart.title, type: chart.type }] : [],
    );
    return { ok: true, result: parsed, charts };
  },

  /** Profil dataset (gratis) — analisis `profile` dari katalog. */
  async profileDataset(
    db: DbOrTx,
    scope: { ownerUserId: string; threadId: string; artifactId: string },
  ): Promise<AnalysisRunResult> {
    return this.runAnalysis(db, { ...scope, analysisId: "profile", args: {} });
  },
};
