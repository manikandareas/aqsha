/**
 * Helper observability yang dipakai bersama runtime Bun (`@aqsha/api`) dan Node (`@aqsha/agent`).
 * Hidup di `@aqsha/db` karena sudah jadi dependency bersama keduanya (sama seperti `AppError`), jadi
 * satu implementasi + satu suite test menjaga parsing sample-rate & redaction konsisten lintas proses.
 *
 * `apps/web` SENGAJA tidak memakai file ini (aturan repo: web tak boleh import `@aqsha/db` agar Drizzle
 * tak masuk bundle klien) — web menyimpan salinan `parseSampleRate` identik di `apps/web/lib/sentry-config.ts`.
 */

/**
 * Parse `SENTRY_TRACES_SAMPLE_RATE` (atau knob rate Sentry lain) ke angka valid di [0,1].
 * `undefined`/kosong/`NaN`/negatif/`>1` → `fallback` (default 0), jadi env salah tak pernah
 * diam-diam menaikkan sampling di luar kuota. Nilai valid di-clamp, bukan ditolak.
 */
export function parseSampleRate(raw: string | undefined | null, fallback = 0): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Pola key yang TAK BOLEH pernah dikirim ke sink observability eksternal (Sentry logs) sebagai
 * atribut — credential/PII. Dipakai `scrubLogAttributes` sebagai jaring pengaman defense-in-depth di
 * atas allowlist call-site (call-site sudah hanya memilih field low-cardinality yang aman).
 */
const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|secret|token|api[-_]?key|access[-_]?key|bearer|email|phone|credential|signature|signed[-_]?url|prompt|completion|content|body)/i;

export type ScalarAttribute = string | number | boolean;

/**
 * Saring map atribut: buang key sensitif (regex di atas) dan nilai non-skalar (Sentry log attributes
 * hanya menerima string/number/boolean). Nilai `undefined`/`null` di-drop. Idempoten & tak pernah
 * melempar — aman dipanggil di jalur log.
 */
export function scrubLogAttributes(
  input: Record<string, unknown> | undefined | null,
): Record<string, ScalarAttribute> {
  const out: Record<string, ScalarAttribute> = {};
  if (!input) return out;
  for (const [key, value] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (value == null) continue;
    const t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      out[key] = value as ScalarAttribute;
    }
  }
  return out;
}
