import { describe, expect, test } from "bun:test";

import { researchDecisionSchema, researchPlanSchema } from "./contracts";
import { generateResearchDecisionObject, generateResearchPlanObject } from "./structured-output";

describe("Deep Research structured output", () => {
  test("generates a Research Plan through the AI SDK structured output boundary", async () => {
    const result = await generateResearchPlanObject({
      model: {} as never,
      prompt: "Plan a literature review on evidence-aware academic writing tools.",
      generateObject: async (options) => {
        expect(options.schema).toBe(researchPlanSchema);
        expect(options.schemaName).toBe("ResearchPlan");

        return {
          object: {
            researchQuestion: "How do evidence-aware writing tools affect thesis drafting?",
            scope: "Academic writing workflows for student researchers.",
            subQuestions: ["What evidence workflows are used?"],
            searchStrategy: ["Search source-grounded academic writing tools."],
            sourceCriteria: ["Traceable claims"],
            exclusions: ["Generic paraphrasing tools"],
            expectedEvidenceTypes: ["studies"],
          },
        };
      },
    });

    expect(result.researchQuestion).toBe("How do evidence-aware writing tools affect thesis drafting?");
  });

  test("generates a Research Decision gate through the structured output boundary", async () => {
    const result = await generateResearchDecisionObject({
      model: {} as never,
      prompt: "Decide whether the run should proceed, refine, or pivot.",
      generateObject: async (options) => {
        expect(options.schema).toBe(researchDecisionSchema);
        expect(options.schemaName).toBe("ResearchDecision");

        return {
          object: {
            decision: "refine",
            rationaleSummary: "The initial sources are relevant but miss one sub-question.",
            evidenceGaps: ["Need one more source about citation verification."],
            nextAction: "Run a focused follow-up search within the same scope.",
            userConfirmationRequired: false,
          },
        };
      },
    });

    expect(result.decision).toBe("refine");
    expect(result.userConfirmationRequired).toBe(false);
  });
});
