import { describe, expect, test } from "bun:test";

import { auditVisualSpecReferences } from "./audit";
import { evidenceLedgerSchema, visualSpecSchema } from "./contracts";

describe("Deep Research contract audit", () => {
  test("checks Visual Spec references against the Evidence Ledger after Zod validates shape", () => {
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
      visualMetrics: [
        {
          metricId: "M1",
          label: "Unsupported claims reduced",
          value: 24,
          unit: "percent",
          sourceIds: ["S1"],
        },
      ],
    });
    const visual = visualSpecSchema.parse({
      visualId: "evidence-timeline",
      visualKind: "timeline",
      title: "Evidence timeline",
      labels: ["2024"],
      dataReferences: [
        {
          referenceType: "metric",
          referenceId: "M1",
        },
      ],
      sourceIds: ["S1"],
      metricIds: ["M1"],
      claimIds: ["C1"],
      caption: "Publication timeline for verified sources.",
      outputIntent: "final_report_embed",
    });

    expect(auditVisualSpecReferences(visual, ledger)).toEqual([]);

    expect(
      auditVisualSpecReferences(
        {
          ...visual,
          dataReferences: [
            ...visual.dataReferences,
            {
              referenceType: "metric",
              referenceId: "MISSING_METRIC",
            },
          ],
          sourceIds: [...visual.sourceIds, "S_MISSING"],
          metricIds: [...visual.metricIds, "MISSING_METRIC"],
        },
        ledger,
      ),
    ).toEqual([
      {
        code: "missing_source",
        message: "Visual Spec references unknown source ID: S_MISSING",
        referenceId: "S_MISSING",
      },
      {
        code: "missing_metric",
        message: "Visual Spec references unknown metric ID: MISSING_METRIC",
        referenceId: "MISSING_METRIC",
      },
    ]);
  });
});
