import { scrubLogAttributes } from "@aqsha/db";
import * as Sentry from "@sentry/node";

type OpsLevel = "info" | "warn" | "error";

/**
 * Kirim satu operational log TERPILIH dari runtime agent ke Sentry Logs.
 *
 * Agent sengaja error-only untuk trace (pipeline OpenTelemetry dimiliki Mastra + Langfuse — lihat
 * `../index.ts`), tapi beberapa event lifecycle penting berguna dicari di console harian Sentry:
 * boot sweep run beku, mulai/selesai `/deep`, degradasi provider. Helper ini jalur eksplisit untuk
 * itu (bukan bulk-forward console). No-op tanpa `SENTRY_DSN_AGENT`; atribut disaring
 * `scrubLogAttributes` (buang credential/PII, hanya skalar) + try/catch agar tak pernah melempar.
 */
export function logOps(
  level: OpsLevel,
  message: string,
  attributes?: Record<string, unknown>,
): void {
  try {
    Sentry.logger[level](message, {
      ...scrubLogAttributes(attributes),
      service: "aqsha-agent",
    });
  } catch {
    // Jalur observability tak boleh mematikan runtime.
  }
}
