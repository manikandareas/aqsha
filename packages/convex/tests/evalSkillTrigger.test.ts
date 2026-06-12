import { describe, expect, it } from "vitest";
import skillTriggerFixture from "./fixtures/golden-sets/skillTriggers.json";
import { BUILTIN_SKILL_DOCS } from "../convex/agent/skills/builtin";
import { parseSkillMarkdown } from "../convex/agent/skills/skillParser";
import { skillWouldTrigger } from "../convex/agent/evals/skillTriggerSurrogate";
import { binaryMetrics, formatMetricsMarkdown } from "../convex/agent/evals/scoring";
import { parseSkillTriggerGolden } from "../convex/agent/evals/goldenSets";
import { scoringText } from "../convex/agent/research/subagents/skillDelegation";
import { emitMetrics } from "./evalEmit";

// Layer-A eval (Slice 3.3): grade the SHIPPED builtin skill descriptions with the
// deterministic trigger surrogate — each must fire on clearly on-domain prompts
// and stay silent on off-domain ones. This is a description-discrimination gate,
// not the model's actual activate_skill choice (that is the non-blocking Layer-B
// LLM eval). Descriptions are read from BUILTIN_SKILL_DOCS (what production ships)
// so the eval can never drift from the bundled skills.

describe("skill-trigger surrogate golden matrix", () => {
  // Score against the SAME description+triggerKeywords composite as production
  // selectDomainPack (scoringText), so an English description backed by Indonesian
  // keywords still fires on Indonesian prompts.
  const scoringByName = new Map<string, string>();
  for (const doc of BUILTIN_SKILL_DOCS) {
    const parsed = parseSkillMarkdown(doc);
    if (parsed) {
      scoringByName.set(
        parsed.name,
        scoringText({
          name: parsed.name,
          description: parsed.description,
          triggerKeywords: parsed.triggerKeywords,
        }),
      );
    }
  }
  const golden = parseSkillTriggerGolden(skillTriggerFixture);

  it("references only known builtin skills", () => {
    for (const row of golden) {
      expect(scoringByName.has(row.skill), `unknown skill: ${row.skill}`).toBe(true);
    }
  });

  const predicted = golden.map((g) => skillWouldTrigger(g.prompt, scoringByName.get(g.skill) ?? ""));
  const expected = golden.map((g) => g.relevant);
  const report = binaryMetrics(predicted, expected);

  it("fires on relevant prompts and stays silent on off-domain ones", () => {
    const wrong = golden
      .map((g, i) => ({ skill: g.skill, prompt: g.prompt, want: g.relevant, got: predicted[i] }))
      .filter((x) => x.got !== x.want);
    expect(wrong).toEqual([]);
    emitMetrics(formatMetricsMarkdown("skill triggers (surrogate)", report));
  });

  it("clears precision + recall floors for the surrogate", () => {
    expect(report.precision).toBeGreaterThanOrEqual(0.9);
    expect(report.recall).toBeGreaterThanOrEqual(0.9);
  });
});
