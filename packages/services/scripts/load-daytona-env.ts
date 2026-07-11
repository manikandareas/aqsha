import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Script stats:* berjalan dengan cwd `packages/services` (tanpa .env) — nilai
 * Daytona hidup di `apps/agent/.env` (sumber yang sama dengan runtime agent).
 * Fallback: bila env belum terisi (mis. tidak inline/export), muat dua key
 * Daytona dari sana. Env yang sudah ada TIDAK ditimpa.
 */
const KEYS = ["DAYTONA_API_KEY", "AQSHA_DAYTONA_SNAPSHOT"] as const;

export function loadDaytonaEnvFallback(): void {
  if (KEYS.every((key) => process.env[key])) return;
  const envPath = resolve(import.meta.dir, "../../../apps/agent/.env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    // Accept an optional `export ` prefix (`export KEY=value`) as well as bare `KEY=value`.
    const match = line.match(/^(?:export\s+)?([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const key = match[1] as (typeof KEYS)[number];
    if (!KEYS.includes(key) || process.env[key]) continue;
    // Buang komentar trailing + kutip pembungkus.
    const value = match[2].split(/\s+#/)[0].trim().replace(/^["']|["']$/g, "");
    if (value) process.env[key] = value;
  }
}
