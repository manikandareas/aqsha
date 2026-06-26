/**
 * AppError — error terstruktur framework-agnostic (pengganti ConvexError V1).
 *
 * Hidup di `@aqsha/db` karena package ini sudah jadi dependency BERSAMA
 * `@aqsha/services` (yang melempar) dan `@aqsha/api` (yang menangkap +
 * memetakan ke HTTP). Satu definisi = satu identitas `instanceof` lintas-boundary.
 *
 * Payload mengikuti kontrak frontend: { message, code, severity?, field? } + `status`
 * HTTP (default 400; override untuk 401/409/429/500).
 */
export type AppErrorSeverity = "info" | "warning" | "error";

export type AppErrorData = {
  message: string;
  code: string;
  severity?: AppErrorSeverity;
  field?: string;
};

export class AppError extends Error {
  readonly code: string;
  readonly severity?: AppErrorSeverity;
  readonly field?: string;
  readonly status: number;

  constructor(data: AppErrorData & { status?: number }) {
    super(data.message);
    this.name = "AppError";
    this.code = data.code;
    this.severity = data.severity;
    this.field = data.field;
    this.status = data.status ?? 400;
  }
}

export function throwAppError(data: AppErrorData & { status?: number }): never {
  throw new AppError(data);
}
