import { describe, expect, test } from "bun:test";

import {
  functionalDeepResearchPhasePath,
  runFunctionalDeepResearch,
} from "./functional";

describe("Functional Deep Research orchestration", () => {
  test("runs the full Functional Phase Path and returns final Markdown with an inline published visual", async () => {
    const events: unknown[] = [];
    const structuredPhases: string[] = [];
    const renderedVisualIds: string[] = [];

    const result = await runFunctionalDeepResearch(
      {
        model: "fake-model",
        researchQuestion:
          "How should student researchers use evidence-aware AI for thesis writing?",
        context: "User asked for a Deep Research report with a supporting visual.",
        deepResearchSkillContent:
          "Use verified evidence, inline Ledger Source ID citations, and safe visual artifacts.",
        generateStructuredOutput: async ({ phase, schemaName }) => {
          structuredPhases.push(phase);

          if (schemaName === "ResearchPlan") {
            return {
              researchQuestion:
                "How should student researchers use evidence-aware AI for thesis writing?",
              scope: "Student research-to-writing workflows.",
              subQuestions: ["How does traceability help academic writing?"],
              searchStrategy: ["Search for evidence-aware academic writing workflows."],
              sourceCriteria: ["Verified source metadata", "Traceable claims"],
              exclusions: ["Generic paraphrasing advice"],
              expectedEvidenceTypes: ["academic studies", "product documentation"],
            };
          }

          if (schemaName === "EvidenceLedger") {
            return {
              sources: [
                {
                  sourceId: "S1",
                  title: "Evidence-aware academic writing workflows",
                  sourceType: "study",
                  url: "https://example.com/evidence-aware-writing",
                  verificationStatus: "verified",
                },
              ],
              claims: [
                {
                  claimId: "C1",
                  claimText:
                    "Traceable evidence can help student researchers defend AI-assisted claims.",
                  claimType: "factual",
                  supportingSourceIds: ["S1"],
                  evidenceStrength: "medium",
                  verificationStatus: "verified",
                },
              ],
              visualMetrics: [
                {
                  metricId: "M1",
                  label: "Verified source count",
                  value: 1,
                  sourceIds: ["S1"],
                },
              ],
            };
          }

          if (schemaName === "ResearchDecision") {
            return {
              decision: "proceed",
              rationaleSummary: "The ledger has enough verified evidence for a concise report.",
              evidenceGaps: [],
              nextAction: "Assemble the final Markdown report.",
              userConfirmationRequired: false,
            };
          }

          if (schemaName === "VisualSpecs") {
            return [
              {
                visualId: "evidence-timeline",
                visualKind: "timeline",
                title: "Evidence timeline",
                labels: ["Verified sources"],
                dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
                sourceIds: ["S1"],
                metricIds: ["M1"],
                caption: "Verified source-backed evidence used in the report.",
                outputIntent: "final_report_embed",
                displayOrder: 1,
              },
            ];
          }

          if (schemaName === "FinalMarkdownReport") {
            return {
              finalReportMarkdown:
                "# Key findings\n\nTraceable evidence helps student researchers defend AI-assisted claims. [S1]\n\n## Evidence and limitations\n\nThe current ledger has one verified source, so conclusions stay scoped. [S1]",
            };
          }

          throw new Error(`Unexpected structured schema: ${schemaName}`);
        },
        generateCompactOutput: async ({ phase, persona }) => ({
          phaseId: phase,
          phase,
          persona,
          status: "completed",
          summary: `${persona} completed ${phase}.`,
          sourceIds: phase === "source_discovery_screening" ? ["S1"] : [],
          claimIds: phase === "synthesis_support" ? ["C1"] : [],
          artifactIds: [],
          recommendation: "proceed",
        }),
        renderAndPublishVisualArtifacts: async ({ visualSpecs }) => {
          renderedVisualIds.push(...visualSpecs.map((visualSpec) => visualSpec.visualId));

          return {
            status: "completed",
            manifest: {
              artifacts: [
                {
                  artifactId: "artifact_timeline",
                  visualId: "evidence-timeline",
                  status: "passed",
                  title: "Evidence timeline",
                  caption: "Verified source-backed evidence used in the report.",
                  outputIntent: "final_report_embed",
                  contentType: "image/png",
                  url: "https://utfs.io/f/evidence-timeline.png",
                  fileKey: "evidence-timeline.png",
                  sourceIds: ["S1"],
                  metricIds: ["M1"],
                  displayOrder: 1,
                },
              ],
            },
            markdown: [
              "![Evidence timeline](https://utfs.io/f/evidence-timeline.png)",
              "",
              "_Verified source-backed evidence used in the report._",
            ].join("\n"),
            events: [
              {
                type: "visual_artifact_published",
                scope: "tool",
                status: "completed",
                title: "Visual artifact published",
                summary: "Evidence timeline was published.",
                payload: { artifactId: "artifact_timeline", visualId: "evidence-timeline" },
              },
            ],
          };
        },
      },
      async (event) => {
        events.push(event);
      },
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected Functional Deep Research to complete.");
    }

    expect(result.finalReportMarkdown).toContain("[S1]");
    expect(result.finalReportMarkdown).toContain(
      "![Evidence timeline](https://utfs.io/f/evidence-timeline.png)",
    );
    expect(result.finalReportMarkdown).not.toContain("Vektor");
    expect(result.compactPhaseOutputs.map((output) => output.phase)).toEqual(
      functionalDeepResearchPhasePath.map((step) => step.phase),
    );
    expect(structuredPhases).toEqual([
      "research_plan",
      "evidence_ledger",
      "research_decision",
      "visual_specification",
      "final_delivery_gate",
    ]);
    expect(renderedVisualIds).toEqual(["evidence-timeline"]);
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "structured_research_output_recorded",
          payload: expect.objectContaining({ outputKind: "evidence_ledger" }),
        }),
        expect.objectContaining({
          type: "visual_artifact_published",
          payload: expect.objectContaining({ visualId: "evidence-timeline" }),
        }),
        expect.objectContaining({
          type: "deep_research_phase_completed",
          payload: expect.objectContaining({ phase: "final_delivery_gate" }),
        }),
      ]),
    );
  });

  test("completes report-only delivery when a default supporting visual fails", async () => {
    const events: unknown[] = [];

    const result = await runFunctionalDeepResearch(
      {
        model: "fake-model",
        researchQuestion:
          "How should student researchers use evidence-aware AI for thesis writing?",
        context: "User asked for a Deep Research report; visual is supporting evidence only.",
        deepResearchSkillContent:
          "Use verified evidence, inline Ledger Source ID citations, and omit unsafe optional visuals.",
        generateStructuredOutput: async ({ schemaName }) => {
          if (schemaName === "ResearchPlan") {
            return {
              researchQuestion:
                "How should student researchers use evidence-aware AI for thesis writing?",
              scope: "Student research-to-writing workflows.",
              subQuestions: ["How does traceability help academic writing?"],
              searchStrategy: ["Search evidence-aware academic writing workflows."],
              sourceCriteria: ["Verified source metadata"],
              exclusions: ["Generic paraphrasing advice"],
              expectedEvidenceTypes: ["academic studies"],
            };
          }

          if (schemaName === "EvidenceLedger") {
            return {
              sources: [
                {
                  sourceId: "S1",
                  title: "Evidence-aware academic writing workflows",
                  sourceType: "study",
                  verificationStatus: "verified",
                },
              ],
              claims: [
                {
                  claimId: "C1",
                  claimText:
                    "Traceable evidence can help student researchers defend AI-assisted claims.",
                  claimType: "factual",
                  supportingSourceIds: ["S1"],
                  evidenceStrength: "medium",
                  verificationStatus: "verified",
                },
              ],
              visualMetrics: [
                {
                  metricId: "M1",
                  label: "Verified source count",
                  value: 1,
                  sourceIds: ["S1"],
                },
              ],
            };
          }

          if (schemaName === "ResearchDecision") {
            return {
              decision: "proceed",
              rationaleSummary: "The ledger supports scoped delivery.",
              evidenceGaps: [],
              nextAction: "Assemble the final report.",
              userConfirmationRequired: false,
            };
          }

          if (schemaName === "VisualSpecs") {
            return [
              {
                visualId: "evidence-timeline",
                visualKind: "timeline",
                title: "Evidence timeline",
                labels: ["Verified sources"],
                dataReferences: [{ referenceType: "metric", referenceId: "M1" }],
                sourceIds: ["S1"],
                metricIds: ["M1"],
                caption: "Verified source-backed evidence used in the report.",
                outputIntent: "final_report_embed",
              },
            ];
          }

          if (schemaName === "FinalMarkdownReport") {
            return {
              finalReportMarkdown:
                "# Key findings\n\nTraceable evidence helps student researchers defend AI-assisted claims. [S1]",
            };
          }

          throw new Error(`Unexpected structured schema: ${schemaName}`);
        },
        generateCompactOutput: async ({ phase, persona }) => ({
          phaseId: phase,
          phase,
          persona,
          status: "completed",
          summary: `${persona} completed ${phase}.`,
          sourceIds: phase === "source_discovery_screening" ? ["S1"] : [],
          claimIds: phase === "synthesis_support" ? ["C1"] : [],
          artifactIds: [],
          recommendation: "proceed",
        }),
        renderAndPublishVisualArtifacts: async () => ({
          status: "failed",
          manifest: {
            artifacts: [
              {
                artifactId: "failed_evidence-timeline",
                visualId: "evidence-timeline",
                status: "failed",
                title: "Evidence timeline",
                caption: "Verified source-backed evidence used in the report.",
                outputIntent: "final_report_embed",
                contentType: "image/png",
                sourceIds: ["S1"],
                metricIds: ["M1"],
                reason: "Visual artifact upload failed. You can retry delivery.",
                metadata: {
                  errorClass: "uploadthing",
                  developerDetail: {
                    message: "UploadThing rejected the PNG with provider detail.",
                  },
                },
              },
            ],
            metadata: { errorClass: "uploadthing" },
          },
          markdown: "",
          events: [
            {
              type: "visual_artifact_upload_failed",
              scope: "error",
              status: "failed",
              title: "Visual artifact upload failed",
              summary: "Visual artifact upload failed. You can retry delivery.",
              payload: {
                visualId: "evidence-timeline",
                errorClass: "uploadthing",
              },
            },
          ],
        }),
      },
      async (event) => {
        events.push(event);
      },
    );

    expect(result.status).toBe("completed");
    if (result.status !== "completed") {
      throw new Error("Expected report-only delivery to complete.");
    }

    expect(result.finalReportMarkdown).toContain("[S1]");
    expect(result.finalReportMarkdown).not.toContain("Visual artifact upload failed");
    expect(result.finalReportMarkdown).not.toContain("UploadThing rejected");
    expect(result.compactPhaseOutputs.at(-2)).toMatchObject({
      phase: "visual_delivery",
      status: "completed",
    });
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "visual_artifact_upload_failed",
          payload: expect.objectContaining({ errorClass: "uploadthing" }),
        }),
        expect.objectContaining({
          type: "visual_omitted",
          payload: expect.objectContaining({
            failureSummary: "Visual artifact upload failed. You can retry delivery.",
          }),
        }),
      ]),
    );
  });
});
