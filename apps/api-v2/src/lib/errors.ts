import { AppError } from "@aqsha/db";
import { Elysia } from "elysia";

/**
 * Pemetaan error terpusat (scope global → menangkap error dari semua route yang
 * di-mount pada app). `AppError` (dari service) → status + payload terstruktur
 * { message, code, severity?, field? }. Eden client menerimanya sebagai
 * `error.value`. Error tak terduga → 500 aman (error asli di-log).
 */
export const errorPlugin = new Elysia({ name: "errorPlugin" }).onError(
  { as: "global" },
  ({ code, error, status }) => {
    if (error instanceof AppError) {
      return status(error.status, {
        message: error.message,
        code: error.code,
        ...(error.severity ? { severity: error.severity } : {}),
        ...(error.field ? { field: error.field } : {}),
      });
    }
    if (code === "VALIDATION") {
      return status(400, { message: "Permintaan tidak valid.", code: "bad_request" });
    }
    if (code === "NOT_FOUND") {
      return status(404, { message: "Not found.", code: "not_found" });
    }
    console.error("[api-v2] unexpected error", error);
    return status(500, { message: "Terjadi kesalahan tak terduga.", code: "internal" });
  },
);
