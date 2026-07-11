import { AppError } from "@aqsha/db";
import { Elysia } from "elysia";
import { logger } from "./log";
import { captureException } from "./sentry";

/**
 * Pemetaan error terpusat (scope global → menangkap error dari semua route yang
 * di-mount pada app). `AppError` (dari service) → status + payload terstruktur
 * { message, code, severity?, field? }. Eden client menerimanya sebagai
 * `error.value`. Error tak terduga → 500 aman, error asli + konteks di-log + `requestId`
 * dikembalikan ke client untuk korelasi dengan baris log server.
 *
 * `requestId`/`ownerUserId` disuntik plugin `observability` + macro `auth` (keduanya
 * global, jalan sebelum handler) → tersedia di konteks onError saat error terjadi di handler.
 */
export const errorPlugin = new Elysia({ name: "errorPlugin" }).onError(
  { as: "global" },
  (ctx) => {
    const { code, error, status, request, path } = ctx;
    const requestId = (ctx as { requestId?: string }).requestId;
    const base = {
      requestId,
      method: request.method,
      path,
      ownerUserId: (ctx as { ownerUserId?: string }).ownerUserId,
    };

    if (error instanceof AppError) {
      // Error domain ter-ekspektasi → breadcrumb level warn (tanpa stack spam).
      logger.warn({ ...base, code: error.code, status: error.status }, "app_error");
      return status(error.status, {
        message: error.message,
        code: error.code,
        ...(error.severity ? { severity: error.severity } : {}),
        ...(error.field ? { field: error.field } : {}),
      });
    }
    if (code === "VALIDATION") {
      logger.warn({ ...base, code: "bad_request" }, "validation_error");
      return status(400, { message: "Permintaan tidak valid.", code: "bad_request" });
    }
    if (code === "NOT_FOUND") {
      logger.warn({ ...base, code: "not_found" }, "not_found");
      return status(404, { message: "Not found.", code: "not_found" });
    }
    // Tak terduga → log error penuh (stack + field pg) + kembalikan requestId. Hanya 5xx/unknown
    // yang dikirim ke Sentry (AppError/VALIDATION/NOT_FOUND di atas sudah return dulu); `base`
    // membawa requestId supaya error Sentry bisa dilompatkan ke baris log server.
    logger.error({ ...base, err: error }, "unexpected_error");
    // Sentry extras SENGAJA tanpa ownerUserId (identitas pengguna = PII) — `requestId` cukup untuk
    // melompat dari event Sentry ke baris log server ini yang menyimpan ownerUserId penuh.
    captureException(error, { requestId, method: request.method, path });
    return status(500, {
      message: "Terjadi kesalahan tak terduga.",
      code: "internal",
      ...(requestId ? { requestId } : {}),
    });
  },
);
