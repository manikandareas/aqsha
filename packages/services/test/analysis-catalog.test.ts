import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { ANALYSIS_CATALOG, ANALYSIS_IDS, analysisCatalogEntry } from "../src/analysis/catalog";

/**
 * Sync-test id katalog TS ↔ registry Python `aqsha_stats` (pola vocab sync-test
 * chat-core↔services di `research-meta.test.ts`). Python tak bisa di-import dari
 * bun → `ANALYSIS_IDS` di registry.py sengaja dipertahankan sebagai literal tuple
 * satu-string-per-baris dan diparse tekstual di sini. Drift id (nambah analisis di
 * satu sisi saja) = test merah.
 */

function pythonAnalysisIds(): string[] {
  const registryPath = resolve(import.meta.dir, "../../stats-py/aqsha_stats/registry.py");
  const source = readFileSync(registryPath, "utf8");
  const tupleMatch = source.match(/ANALYSIS_IDS\s*=\s*\(([\s\S]*?)\)/);
  if (!tupleMatch) throw new Error("ANALYSIS_IDS literal tidak ditemukan di registry.py");
  return [...tupleMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("katalog analisis — sinkron TS ↔ Python", () => {
  test("ANALYSIS_IDS TS == ANALYSIS_IDS aqsha_stats (urutan ikut sama)", () => {
    expect([...ANALYSIS_IDS] as string[]).toEqual(pythonAnalysisIds());
  });

  test("katalog lengkap: tiap id punya entry + lookup by id jalan", () => {
    expect(ANALYSIS_CATALOG.map((e) => e.id)).toEqual([...ANALYSIS_IDS]);
    for (const id of ANALYSIS_IDS) {
      expect(analysisCatalogEntry(id)?.id).toBe(id);
    }
    expect(analysisCatalogEntry("uji_ngarang")).toBeNull();
  });

  test("kredit: profile gratis, sisanya positif (rate sandbox_compute)", () => {
    expect(analysisCatalogEntry("profile")?.credits).toBe(0);
    for (const entry of ANALYSIS_CATALOG) {
      if (entry.id === "profile") continue;
      expect(entry.credits).toBeGreaterThan(0);
    }
  });
});
