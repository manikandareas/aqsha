/**
 * Helper konfigurasi Sentry untuk web (server + edge). Logika parsing sample-rate SENGAJA identik
 * dengan `parseSampleRate` di `@aqsha/db` (dipakai api/agent), tetapi disalin di sini karena `apps/web`
 * tak boleh import `@aqsha/db` (aturan repo: Drizzle keluar dari bundle klien; edge runtime pun tak
 * bisa menjalankan postgres). Satu-satunya sumber logika bersama untuk web ada di file ini.
 */

/**
 * `SENTRY_TRACES_SAMPLE_RATE` harus angka finite di [0,1]; apa pun invalid/NaN/out-of-range → `fallback`
 * (default 0). Nilai valid di-clamp, bukan ditolak — env salah tak pernah menaikkan ingest di luar kuota.
 */
export function parseSampleRate(raw: string | undefined | null, fallback = 0): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}
