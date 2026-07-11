// Builder detail statistik untuk adapter timeline (fase A statistik): tool part
// `run_analysis`/`run_python_analysis` → detail `analysis` (kartu run), `profile_dataset`
// sukses → detail `dataset-profile` (kartu dataset). FE murni — angka/verdict tetap dari
// blok DB (`statsGroupsByToolCallId`), detail ini hanya identitas + args + status ramah.

import { statsAnalysisMeta, toRunKey } from "@aqsha/chat-core/stats-viz";
import type {
  DatasetProfileColumn,
  DatasetProfileSummary,
  DeepStepDetail,
} from "./timeline-types";

type AnalysisDetail = Extract<DeepStepDetail, { kind: "analysis" }>;

/** Tool statistik yang berjalan lama di sandbox → baris generiknya diberi elapsed berdetak. */
export const STATS_SANDBOX_TOOLS = new Set(["run_analysis", "run_python_analysis", "profile_dataset"]);

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "X1.1–X1.5" untuk daftar kolom panjang; ≤2 item ditulis apa adanya. */
function listSummary(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((x): x is string => typeof x === "string" && x.length > 0);
  if (items.length === 0) return undefined;
  return items.length <= 2 ? items.join(", ") : `${items[0]}–${items[items.length - 1]}`;
}

/** Batas ringkasan args di kartu (satu baris muat; nilai penuh tak dibutuhkan — ini identitas). */
const ARGS_SUMMARY_MAX = 140;

/**
 * Ringkasan mapping kolom `run_analysis` (`args.args`), best-effort: scalar apa adanya, daftar
 * kolom dirangkum first–last, objek laten→item (latents/groups) dipecah per laten. Kosong/tak
 * terbaca → undefined (kartu menyembunyikan barisnya).
 */
export function statsArgsSummary(rawArgs: unknown): string | undefined {
  const args = asRecord(rawArgs);
  const parts: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value) parts.push(`${key}: ${value}`);
    else if (typeof value === "number" && Number.isFinite(value)) parts.push(`${key}: ${value}`);
    else if (typeof value === "boolean") parts.push(`${key}: ${value ? "ya" : "tidak"}`);
    else if (Array.isArray(value)) {
      const summary = listSummary(value);
      if (summary) parts.push(`${key}: ${summary}`);
    } else if (value && typeof value === "object") {
      // Peta laten → item (latents/groups): tampilkan per laten, kunci luar tak informatif.
      for (const [latent, items] of Object.entries(value as Record<string, unknown>)) {
        const summary = listSummary(items);
        if (summary) parts.push(`${latent}: ${summary}`);
      }
    }
  }
  if (parts.length === 0) return undefined;
  const joined = parts.join(" · ");
  return joined.length > ARGS_SUMMARY_MAX ? `${joined.slice(0, ARGS_SUMMARY_MAX - 1)}…` : joined;
}

/**
 * Detail `analysis` dari INPUT tool (chunk `tool-call` / delta terparse / rehydrate args).
 * Toleran args parsial (streaming): id analisis belum ada → title fallback + credits 0, delta
 * berikutnya menimpa. Bukan tool run statistik → undefined.
 */
export function statsRunDetailFromArgs(
  toolName: string,
  toolCallId: string,
  rawArgs: unknown,
): AnalysisDetail | undefined {
  const args = asRecord(rawArgs);
  const artifactId = str(args.artifactId);
  if (toolName === "run_analysis") {
    const analysis = str(args.analysis);
    const meta = statsAnalysisMeta(analysis);
    const argsSummary = statsArgsSummary(args.args);
    return {
      kind: "analysis",
      analysis,
      // Id di luar katalog (model typo) → tampilkan id mentah; tool-nya sendiri akan ok:false.
      title: meta?.label ?? (analysis || "Analisis statistik"),
      ...(argsSummary ? { argsSummary } : {}),
      ...(artifactId ? { artifactId } : {}),
      credits: meta?.credits ?? 0,
      runKey: toRunKey(toolCallId),
    };
  }
  if (toolName === "run_python_analysis") {
    const meta = statsAnalysisMeta("custom");
    return {
      kind: "analysis",
      analysis: "custom",
      title: str(args.title) || meta?.label || "Analisis kustom",
      ...(artifactId ? { artifactId } : {}),
      credits: meta?.credits ?? 10,
      runKey: toRunKey(toolCallId),
    };
  }
  return undefined;
}

/**
 * Detail statistik saat tool SETTLE (chunk `tool-result` / rehydrate `state==='result'`):
 * run analisis `ok:false` → tandai `failed` + note ramah tool (blocked kredit / mapping kolom);
 * `profile_dataset` `ok:true` → detail `dataset-profile`. `prev` = detail dari args (bisa absen
 * saat re-attach mid-stream melewatkan `tool-call` — dibangun ulang minimal dari result).
 */
export function statsDetailFromResult(
  toolName: string,
  toolCallId: string,
  prev: DeepStepDetail | undefined,
  result: unknown,
  artifactId?: string,
): DeepStepDetail | undefined {
  const r = asRecord(result);
  if (toolName === "run_analysis" || toolName === "run_python_analysis") {
    const base =
      prev?.kind === "analysis" ? prev : statsRunDetailFromArgs(toolName, toolCallId, {});
    if (!base) return undefined;
    if (r.ok === false) {
      const note = str(r.note);
      return { ...base, failed: true, ...(note ? { note } : {}) };
    }
    // ok:true — isi id analisis dari result bila args belum sempat terbaca (re-attach).
    const analysis = str(r.analysis) || base.analysis;
    const meta = statsAnalysisMeta(analysis);
    return {
      ...base,
      analysis,
      title: base.analysis ? base.title : (meta?.label ?? base.title),
      credits: base.analysis ? base.credits : (meta?.credits ?? base.credits),
    };
  }
  if (toolName === "profile_dataset" && r.ok === true) {
    const profile = datasetProfileSummary(r.profile);
    if (!profile) return undefined;
    return { kind: "dataset-profile", artifactId: artifactId ?? "", profile };
  }
  return undefined;
}

/**
 * Parse defensif output analisis `profile` (`aqsha_stats/analyses/profile.py`): tabel id
 * `profile` dibaca by NAMA kolom (bukan indeks tetap), `meta.n` = jumlah baris. Bentuk tak
 * dikenal / tabel absen → undefined (kartu tak dirender, tool-row generik tetap tampil).
 */
export function datasetProfileSummary(profile: unknown): DatasetProfileSummary | undefined {
  const p = asRecord(profile);
  const tables = Array.isArray(p.tables) ? p.tables : [];
  const profileTable = tables.map(asRecord).find((t) => t.id === "profile");
  if (!profileTable) return undefined;
  const header = Array.isArray(profileTable.columns) ? profileTable.columns.map(String) : [];
  const iName = header.indexOf("Kolom");
  const iType = header.indexOf("Tipe");
  const iMissing = header.indexOf("Missing");
  const iLikert = header.indexOf("Likert");
  if (iName < 0) return undefined;

  const columns: DatasetProfileColumn[] = [];
  for (const raw of Array.isArray(profileTable.rows) ? profileTable.rows : []) {
    if (!Array.isArray(raw)) continue;
    const name = str(raw[iName]);
    if (!name) continue;
    const type = iType >= 0 ? str(raw[iType]) || "unknown" : "unknown";
    const missingRaw = iMissing >= 0 ? raw[iMissing] : 0;
    const missing =
      typeof missingRaw === "number" && Number.isFinite(missingRaw) && missingRaw > 0
        ? Math.floor(missingRaw)
        : 0;
    const likertRaw = iLikert >= 0 ? str(raw[iLikert]) : "";
    columns.push({ name, type, missing, ...(likertRaw && likertRaw !== "-" ? { likert: likertRaw } : {}) });
  }
  if (columns.length === 0) return undefined;

  const meta = asRecord(p.meta);
  const rowCount =
    typeof meta.n === "number" && Number.isFinite(meta.n) && meta.n >= 0 ? meta.n : undefined;
  return { ...(rowCount !== undefined ? { rowCount } : {}), columns };
}
