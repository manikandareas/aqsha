/**
 * Sync-test display-meta chat-core ↔ katalog analisis services (pola vocab stance
 * `research-meta.test.ts`): apps/web dilarang import @aqsha/services, jadi label/kredit
 * kartu run di chat diambil dari `STATS_ANALYSIS_META` (@aqsha/chat-core/stats-viz) —
 * test ini menjaga id, label, credits, dan heavy tak drift dari `ANALYSIS_CATALOG`.
 */
import { STATS_ANALYSIS_META } from "@aqsha/chat-core/stats-viz";
import { describe, expect, test } from "bun:test";
import { ANALYSIS_CATALOG } from "../src/analysis/catalog";

/** Transform judul → label pendek, PERSIS `shortTitle` tool `run_analysis` (agent). */
function shortTitle(title: string): string {
  return title.replace(/\s*\(.*\)\s*$/, "");
}

describe("STATS_ANALYSIS_META — sinkron chat-core ↔ katalog services", () => {
  test("id META = seluruh id katalog + entri sintetis `custom`", () => {
    expect(Object.keys(STATS_ANALYSIS_META).sort()).toEqual(
      [...ANALYSIS_CATALOG.map((e) => e.id as string), "custom"].sort(),
    );
  });

  test("label = judul katalog tanpa anotasi kurung; credits + heavy identik", () => {
    for (const entry of ANALYSIS_CATALOG) {
      const meta = STATS_ANALYSIS_META[entry.id];
      expect(meta, entry.id).toBeDefined();
      expect(meta?.label, entry.id).toBe(shortTitle(entry.title));
      expect(meta?.credits, entry.id).toBe(entry.credits);
      expect(Boolean(meta?.heavy), entry.id).toBe(entry.heavy);
    }
  });

  test("entri custom: kredit flat 10 (mirror PYTHON_ANALYSIS_CREDITS run_python_analysis)", () => {
    expect(STATS_ANALYSIS_META.custom).toEqual({ label: "Analisis kustom", credits: 10 });
  });
});
