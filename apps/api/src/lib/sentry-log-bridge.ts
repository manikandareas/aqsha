import { scrubLogAttributes, type ScalarAttribute } from "@aqsha/db";

/**
 * Jembatan Pino → Sentry Logs (murni, tanpa side-effect — dipanggil sink di `./log.ts`).
 *
 * Policy telemetry (docs/observability-sentry-consolidation-plan.md §5.1): TIDAK semua stdout dikirim
 * ke Sentry.
 *  - `fatal`/`error`/`warn` → selalu di-bridge (searchable log, melengkapi event exception).
 *  - `info` → HANYA event lifecycle bernilai tinggi yang menandai dirinya `notable: true`
 *    (mis. `api_started`, `workers_started`, `feed_hydration_cycle_fanout`). Access-log per-request
 *    (`msg="request"`) & info rutin → stdout saja, tak membebani kuota logs Sentry.
 *  - `debug`/`trace` → tak pernah di-bridge.
 *
 * Atribut hanya diambil dari ALLOWLIST field low-cardinality yang aman (bukan blacklist) lalu masih
 * disaring `scrubLogAttributes` sebagai defense-in-depth. Field mentah (body/header/prompt/PII) tak
 * pernah punya jalan masuk. Redaction Pino sudah jalan lebih dulu di string yang kita terima.
 */

export type SentryLogLevel = "warn" | "error" | "fatal" | "info";

export interface SentryLogRecord {
  level: SentryLogLevel;
  message: string;
  attributes: Record<string, ScalarAttribute>;
}

// Field korelasi/diagnostik yang aman jadi atribut searchable (bukan dimensi metrik).
const STRING_KEYS = [
  "requestId", "method", "path", "code", "pattern", "lane", "kind", "queue", "worker",
  "monitorSlug", "deepRunId", "threadId",
] as const;
const NUMBER_KEYS = ["status", "attemptsMade", "port", "scheduled", "queues"] as const;
const BOOL_KEYS = ["ok"] as const;

function levelFor(raw: unknown): SentryLogLevel | null {
  switch (raw) {
    case "fatal":
      return "fatal";
    case "error":
      return "error";
    case "warn":
      return "warn";
    case "info":
      return "info";
    default:
      // `debug`/`trace`/level numerik tak dikenal → tak di-bridge.
      return null;
  }
}

/**
 * Petakan satu record Pino (hasil `JSON.parse` baris NDJSON) ke satu Sentry log, atau `null` bila
 * policy memutuskan baris itu tak di-bridge.
 */
export function pinoRecordToSentryLog(
  record: Record<string, unknown>,
): SentryLogRecord | null {
  const level = levelFor(record.level);
  if (!level) return null;
  if (level === "info" && record.notable !== true) return null;

  const attrs: Record<string, unknown> = {};
  for (const k of STRING_KEYS) if (typeof record[k] === "string") attrs[k] = record[k];
  for (const k of NUMBER_KEYS) if (typeof record[k] === "number") attrs[k] = record[k];
  for (const k of BOOL_KEYS) if (typeof record[k] === "boolean") attrs[k] = record[k];

  // Worker child memakai `worker` sebagai nama queue → satukan ke `queue`, buang duplikatnya.
  if (attrs.queue == null && typeof record.worker === "string") attrs.queue = record.worker;
  delete attrs.worker;

  if (typeof record.ms === "number") attrs.durationMs = record.ms;

  // Ringkasan error dari err/error (type/code/status) SAJA — tanpa message/stack/detail yang bisa
  // memuat data; stack penuh ada di event exception terpisah, log ini untuk korelasi & pencarian.
  const errObj = (record.err ?? record.error) as Record<string, unknown> | undefined;
  if (errObj && typeof errObj === "object") {
    if (typeof errObj.type === "string") attrs.errorType = errObj.type;
    if (typeof errObj.code === "string") attrs.errorCode = errObj.code;
    if (typeof errObj.status === "number") attrs.errorStatus = errObj.status;
  }

  const message =
    typeof record.msg === "string" && record.msg.length > 0 ? record.msg : level;
  return { level, message, attributes: scrubLogAttributes(attrs) };
}
