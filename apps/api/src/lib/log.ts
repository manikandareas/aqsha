import * as Sentry from "@sentry/bun";
// Default import (pino `export =` + esModuleInterop) — memberi objek pino ter-merge yang membawa
// static `.multistream` + tipe `.LoggerOptions`/`.StreamEntry`. Named `{ pino }` menunjuk `pino.pino`
// (fungsi saja, tanpa static/namespace) sehingga `pino.multistream` tak terlihat.
import pino from "pino";
import { pinoRecordToSentryLog } from "./sentry-log-bridge";

/**
 * Logger pino terpusat untuk api (server + workers). Output NDJSON ke stdout —
 * di dev di-pipe ke `pino-pretty` lewat script (`dev`/`worker`), di prod (container)
 * raw JSON siap dibaca. Tanpa transport worker-thread (aman di Bun + zero overhead).
 *
 * Level via `LOG_LEVEL` (default `info`, `debug` di dev). `requestId` + konteks route
 * disuntik per-request oleh plugin `observability`; error di-serialize sadar-Postgres.
 *
 * SINK SENTRY LOGS: bila `SENTRY_DSN_API` ada, stream KEDUA (inline, bukan worker-thread) mem-bridge
 * baris terpilih (warn/error + info `notable`) ke Sentry Logs lewat `pinoRecordToSentryLog`. stdout
 * tetap sink utama; Sentry hanya menerima subset diagnostik ter-redaksi. Lihat
 * docs/ops/observability/sentry-consolidation-plan.md §5.1.
 */
const isProd = process.env.NODE_ENV === "production";
const SERVICE = "aqsha-api";

/**
 * Serializer error sadar-Postgres + AppError: ekstrak field diagnostik (pg
 * `code`/`detail`/`constraint`/`table`, AppError `code`/`status`/`field`) + stack
 * + `cause` berantai, supaya 500 tak lagi cuma "[object Object]".
 */
function serializeError(value: unknown): Record<string, unknown> {
  if (!(value instanceof Error)) return { message: String(value) };
  const err = value as Error & Record<string, unknown>;
  const out: Record<string, unknown> = { type: err.name, message: err.message, stack: err.stack };
  // Field pg (postgres.js) + AppError — own-enumerable, salin yang ada saja.
  for (const k of ["code", "detail", "hint", "constraint", "table", "schema", "severity", "field", "status", "routine"]) {
    if (err[k] !== undefined) out[k] = err[k];
  }
  if (err.cause) out.cause = serializeError(err.cause);
  return out;
}

const options: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    // Top-level + satu level nested (pino `*` cuma satu level). Jaring pengaman: call-site sekarang
    // tak pernah log body/header/PII mentah, ini mengunci masa depan (credential + PII terlarang
    // per policy §5.1: auth header, cookie, token, api key, password, email, signed URL).
    paths: [
      "authorization", "*.authorization", "headers.authorization",
      "cookie", "*.cookie", "headers.cookie", 'headers["set-cookie"]',
      "token", "*.token", "refreshToken", "*.refreshToken", "continuationToken", "*.continuationToken",
      "password", "*.password",
      "apiKey", "*.apiKey", "accessKey", "*.accessKey", "secret", "*.secret",
      "email", "*.email", "signedUrl", "*.signedUrl",
    ],
    censor: "[redacted]",
  },
  serializers: { err: serializeError, error: serializeError },
};

/**
 * Sink stream KEDUA: menerima baris NDJSON final (redaction sudah diterapkan pino), memutuskan
 * lewat policy `pinoRecordToSentryLog`, lalu meneruskan ke Sentry Logs. `Sentry.logger.*` no-op
 * sampai `initSentry` jalan; try/catch memastikan jalur log TAK PERNAH melempar.
 */
function sentryLogStream(): { write(line: string): void } {
  const proc = process.env.AQSHA_PROCESS ?? "api";
  return {
    write(line: string): void {
      try {
        const record = JSON.parse(line) as Record<string, unknown>;
        const log = pinoRecordToSentryLog(record);
        if (!log) return;
        Sentry.logger[log.level](log.message, {
          ...log.attributes,
          service: SERVICE,
          process: proc,
        });
      } catch {
        // Baris tak-JSON / error apa pun di sink observability tak boleh mematikan logging.
      }
    },
  };
}

export const logger = process.env.SENTRY_DSN_API
  ? pino(
      options,
      pino.multistream([
        { stream: process.stdout },
        // Sentry hanya menerima info ke atas; policy severity/notable difilter di dalam bridge.
        { level: "info", stream: sentryLogStream() },
      ]),
    )
  : pino(options);
