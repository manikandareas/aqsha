import { emptyFeatureCounts, normalizeFeatureCounts } from "@aqsha/db";
import { describe, expect, test } from "bun:test";
import { INDO_BRAND_PROMPT } from "../src/doc-ai.service";
import { estimateCredits, requiredPlanForFeature } from "../src/plan";

// Billing AI editor dokumen native (event `doc_ai_edit`, rate Lite). Helper pure — tanpa db/`ai`.
describe("doc_ai_edit billing", () => {
  test("estimateCredits → rate Lite berbasis token (sama dengan normal_chat)", () => {
    const tokens = { feature: "doc_ai_edit" as const, totalTokens: 3_000 };
    const lite = estimateCredits({ feature: "normal_chat", totalTokens: 3_000 });
    expect(estimateCredits(tokens)).toBe(lite);
    // 3000 / 1500 token-per-credit = 2 kredit.
    expect(estimateCredits(tokens)).toBe(2);
    // Minimal 1 kredit walau token kecil.
    expect(estimateCredits({ feature: "doc_ai_edit", totalTokens: 1 })).toBe(1);
  });

  test("requiredPlanForFeature → gate sama dengan chat Lite (free)", () => {
    expect(requiredPlanForFeature("doc_ai_edit")).toBe("free");
  });

  test("featureCounts memuat doc_ai_edit (rollup usage)", () => {
    expect(emptyFeatureCounts().doc_ai_edit).toBe(0);
    expect(normalizeFeatureCounts({ ...emptyFeatureCounts(), doc_ai_edit: 5 }).doc_ai_edit).toBe(5);
    expect(normalizeFeatureCounts(null).doc_ai_edit).toBe(0);
  });

  test("INDO_BRAND_PROMPT = Bahasa Indonesia + tak menyentuh protokol operasi blok", () => {
    expect(INDO_BRAND_PROMPT).toContain("Bahasa Indonesia");
    expect(INDO_BRAND_PROMPT.length).toBeGreaterThan(0);
  });
});
