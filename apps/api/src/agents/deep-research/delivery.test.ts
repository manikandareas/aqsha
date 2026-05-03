import { describe, expect, test } from "bun:test";

import { evaluateDeepResearchDelivery } from "./delivery";
import { evidenceLedgerSchema } from "./contracts";

describe("Deep Research delivery gate", () => {
  test("hard fails final delivery when an Important Claim fails evidence audit", () => {
    const ledger = evidenceLedgerSchema.parse({
      sources: [
        {
          sourceId: "S1",
          title: "Evidence-aware writing assistants",
          sourceType: "study",
          verificationStatus: "verified",
        },
      ],
      claims: [
        {
          claimId: "C1",
          claimText: "Evidence-aware tools eliminate unsupported academic claims.",
          claimType: "factual",
          supportingSourceIds: ["S1"],
          evidenceStrength: "insufficient",
          verificationStatus: "unverified",
        },
      ],
    });

    const result = evaluateDeepResearchDelivery({
      finalReportMarkdown: "# Final report\n\nUnsupported final answer.",
      evidenceLedger: ledger,
      artifacts: [],
    });

    expect(result).toEqual({
      status: "failed",
      runStatus: "failed",
      assistantMessage: expect.stringContaining("Deep Research could not deliver a final report"),
      events: [
        expect.objectContaining({
          type: "evidence_audit_failed",
          scope: "error",
          status: "failed",
          title: "Evidence audit failed",
          payload: expect.objectContaining({
            failureSummary: expect.stringContaining("C1"),
            developerDetail: expect.objectContaining({
              issues: [
                expect.objectContaining({
                  claimId: "C1",
                  code: "important_claim_unverified",
                }),
                expect.objectContaining({
                  claimId: "C1",
                  code: "important_claim_insufficient",
                }),
              ],
            }),
          }),
        }),
      ],
    });
  });

  test("delivers a valid final report with an omitted-visual note when default visual data is insufficient", () => {
    const ledger = evidenceLedgerSchema.parse({
      sources: [
        {
          sourceId: "S1",
          title: "Evidence-aware writing assistants",
          sourceType: "study",
          verificationStatus: "verified",
        },
      ],
      claims: [
        {
          claimId: "C1",
          claimText: "Evidence-aware tools can reduce unsupported academic claims.",
          claimType: "factual",
          supportingSourceIds: ["S1"],
          evidenceStrength: "medium",
          verificationStatus: "verified",
        },
      ],
    });

    const result = evaluateDeepResearchDelivery({
      finalReportMarkdown: "# Final report\n\nEvidence-backed answer. [S1]",
      evidenceLedger: ledger,
      artifacts: [
        {
          status: "omitted",
          title: "Evidence timeline",
          failureSummary: "Visual omitted because the Evidence Ledger has no visual-ready metrics.",
          developerDetail: {
            code: "insufficient_visual_data",
            visualId: "evidence-timeline",
          },
        },
      ],
    });

    expect(result).toEqual({
      status: "completed",
      runStatus: "completed",
      finalReportMarkdown: expect.stringContaining(
        "Visual omitted because the Evidence Ledger has no visual-ready metrics.",
      ),
      events: [
        expect.objectContaining({
          type: "visual_omitted",
          scope: "tool",
          status: "completed",
          title: "Visual omitted",
          payload: expect.objectContaining({
            failureSummary: "Visual omitted because the Evidence Ledger has no visual-ready metrics.",
            developerDetail: {
              code: "insufficient_visual_data",
              visualId: "evidence-timeline",
            },
          }),
        }),
      ],
    });
  });

  test("hard fails when the visual artifact is the explicit primary deliverable", () => {
    const ledger = evidenceLedgerSchema.parse({
      sources: [
        {
          sourceId: "S1",
          title: "Evidence-aware writing assistants",
          sourceType: "study",
          verificationStatus: "verified",
        },
      ],
      claims: [
        {
          claimId: "C1",
          claimText: "Evidence-aware tools can reduce unsupported academic claims.",
          claimType: "factual",
          supportingSourceIds: ["S1"],
          evidenceStrength: "medium",
          verificationStatus: "verified",
        },
      ],
    });

    const result = evaluateDeepResearchDelivery({
      finalReportMarkdown: "# Final report\n\nEvidence-backed answer. [S1]",
      evidenceLedger: ledger,
      primaryDeliverable: "visual",
      artifacts: [
        {
          status: "failed",
          title: "Evidence timeline",
          failureSummary: "UploadThing rejected the primary visual artifact.",
          developerDetail: {
            code: "upload_failed",
            provider: "uploadthing",
          },
        },
      ],
    });

    expect(result).toEqual({
      status: "failed",
      runStatus: "failed",
      assistantMessage: expect.stringContaining(
        "Deep Research could not deliver the requested primary visual artifact",
      ),
      events: [
        expect.objectContaining({
          type: "visual_artifact_failed",
          scope: "error",
          status: "failed",
          title: "Primary visual artifact failed",
          payload: expect.objectContaining({
            failureSummary: "UploadThing rejected the primary visual artifact.",
            developerDetail: {
              code: "upload_failed",
              provider: "uploadthing",
            },
          }),
        }),
      ],
    });
  });

  test("gracefully degrades to report-only output when default visual upload fails", () => {
    const ledger = evidenceLedgerSchema.parse({
      sources: [
        {
          sourceId: "S1",
          title: "Evidence-aware writing assistants",
          sourceType: "study",
          verificationStatus: "verified",
        },
      ],
      claims: [
        {
          claimId: "C1",
          claimText: "Evidence-aware tools can reduce unsupported academic claims.",
          claimType: "factual",
          supportingSourceIds: ["S1"],
          evidenceStrength: "medium",
          verificationStatus: "verified",
        },
      ],
    });

    const result = evaluateDeepResearchDelivery({
      finalReportMarkdown: "# Final report\n\nEvidence-backed answer. [S1]",
      evidenceLedger: ledger,
      artifacts: [
        {
          status: "failed",
          title: "Evidence timeline",
          failureSummary: "Visual omitted because UploadThing rejected the PNG.",
          developerDetail: {
            code: "upload_failed",
            provider: "uploadthing",
          },
        },
      ],
    });

    expect(result).toEqual({
      status: "completed",
      runStatus: "completed",
      finalReportMarkdown: expect.stringContaining(
        "Visual omitted because UploadThing rejected the PNG.",
      ),
      events: [
        expect.objectContaining({
          type: "visual_omitted",
          scope: "tool",
          status: "completed",
          title: "Visual omitted",
          payload: expect.objectContaining({
            failureSummary: "Visual omitted because UploadThing rejected the PNG.",
            developerDetail: {
              code: "upload_failed",
              provider: "uploadthing",
            },
          }),
        }),
      ],
    });
  });
});
