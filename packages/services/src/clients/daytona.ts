import { Daytona, type Sandbox } from "@daytona/sdk";

/**
 * Satu-satunya tempat client Daytona dibuat (pola `clients/s3.ts`). Dipakai
 * `AnalysisService` (sandbox statistik per-thread) + script snapshot/smoke.
 * Env: `DAYTONA_API_KEY` (auth) + `AQSHA_DAYTONA_SNAPSHOT` (nama snapshot
 * versioned berisi stack stats + package `aqsha_stats`, mis. `aqsha-stats-v1`).
 * Fail-fast saat pertama dipakai — import modul tidak pernah throw.
 */
let client: Daytona | null = null;

/** Auto-stop sandbox saat idle (menit). API call me-reset timer; proses internal tidak. */
export const SANDBOX_AUTO_STOP_MINUTES = 15;
/** Timeout default `codeRun` (detik); analisis berat (bootstrap besar) pakai yang panjang. */
export const CODE_RUN_TIMEOUT_SECONDS = 120;
export const CODE_RUN_HEAVY_TIMEOUT_SECONDS = 300;

export function getStatsSnapshotName(): string {
  const snapshot = process.env.AQSHA_DAYTONA_SNAPSHOT;
  if (!snapshot) {
    throw new Error("AQSHA_DAYTONA_SNAPSHOT is required for statistics sandbox (e.g. aqsha-stats-v1)");
  }
  return snapshot;
}

export function getDaytona(): Daytona {
  if (client) return client;
  const apiKey = process.env.DAYTONA_API_KEY;
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is required for statistics sandbox");
  }
  client = new Daytona({ apiKey });
  return client;
}

/**
 * Create sandbox stats dari snapshot prebaked. Isolasi = container (bukan microVM)
 * → mitigasi wajib: `networkBlockAll` (analisis statistik tak butuh egress) +
 * sandbox per-user-thread (label). File persist across stop; variabel Python TIDAK
 * persist antar `codeRun` (stateless per call by design).
 */
export async function createStatsSandbox(labels: Record<string, string>): Promise<Sandbox> {
  return getDaytona().create({
    snapshot: getStatsSnapshotName(),
    labels,
    networkBlockAll: true,
    autoStopInterval: SANDBOX_AUTO_STOP_MINUTES,
  });
}

/** True hanya untuk "sandbox tak ditemukan" (404) — bukan auth/jaringan/5xx. */
function isSandboxNotFound(error: unknown): boolean {
  const status =
    (error as { statusCode?: number; status?: number })?.statusCode ??
    (error as { status?: number })?.status;
  if (status === 404) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /not found|404|does not exist/i.test(message);
}

/**
 * Ambil sandbox by id; `null` HANYA bila sudah dihapus/tak ditemukan (caller re-create).
 * Error lain (API key salah, jaringan, 5xx) DI-RETHROW — kalau ditelan jadi `null`, caller
 * mengira sandbox terhapus lalu re-create tanpa henti (leak) sambil menyembunyikan misconfig.
 */
export async function findSandbox(sandboxId: string): Promise<Sandbox | null> {
  try {
    return await getDaytona().get(sandboxId);
  } catch (error) {
    if (isSandboxNotFound(error)) return null;
    throw error;
  }
}

export async function deleteSandbox(sandboxId: string): Promise<void> {
  const sandbox = await findSandbox(sandboxId);
  if (sandbox) await sandbox.delete();
}
