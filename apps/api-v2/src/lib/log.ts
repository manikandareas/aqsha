import { pino } from "pino";

/**
 * Logger pino terpusat untuk api-v2 (server + workers). Output NDJSON ke stdout —
 * di dev di-pipe ke `pino-pretty` lewat script (`dev`/`worker`), di prod (systemd)
 * raw JSON siap di-agregasi. Tanpa transport worker-thread (aman di Bun + zero overhead).
 *
 * Level via `LOG_LEVEL` (default `info`, `debug` di dev). `requestId` + konteks route
 * disuntik per-request oleh plugin `observability`; error di-serialize sadar-Postgres.
 */
const isProd = process.env.NODE_ENV === "production";

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

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? "info" : "debug"),
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    // Top-level + satu level nested (pino `*` cuma satu level). Jaring pengaman:
    // call-site sekarang tak pernah log body/header mentah, ini buat masa depan.
    paths: [
      "authorization", "token", "continuationToken", "password",
      "*.authorization", "*.token", "*.continuationToken", "*.password",
      "headers.authorization", "headers.cookie",
    ],
    censor: "[redacted]",
  },
  serializers: { err: serializeError, error: serializeError },
});
