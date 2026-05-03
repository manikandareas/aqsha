import { describe, expect, test } from "bun:test";

import {
  artifactManifestSchema,
  evidenceLedgerSchema,
  researchDecisionSchema,
  researchPlanSchema,
  visualSpecSchema,
} from "./contracts";

describe("Deep Research contracts", () => {
  test("accept a Research Plan after scoping while keeping the core contract strict and metadata flexible", () => {
    const plan = researchPlanSchema.parse({
      researchQuestion: "How do evidence-aware writing tools affect thesis drafting?",
      scope: "Undergraduate and graduate academic writing workflows.",
      subQuestions: [
        "What evidence workflows are used?",
        "Where do citations fail?",
      ],
      searchStrategy: [
        "Search academic databases for evidence-aware writing assistants.",
        "Compare source-grounded writing workflows.",
      ],
      sourceCriteria: [
        "Peer-reviewed research",
        "Product documentation with traceable claims",
      ],
      exclusions: ["Generic paraphrasing tools without evidence tracking"],
      expectedEvidenceTypes: ["studies", "benchmarks", "product docs"],
      reconnaissanceNotes: "Initial terminology check only; source discovery has not started.",
      metadata: {
        provider: "openai",
        runId: "run_123",
      },
    });

    expect(plan.researchQuestion).toBe("How do evidence-aware writing tools affect thesis drafting?");
    expect(plan.metadata).toEqual({
      provider: "openai",
      runId: "run_123",
    });

    expect(() =>
      researchPlanSchema.parse({
        ...plan,
        finalReportMarkdown: "# Final report should stay outside structured contracts",
      }),
    ).toThrow();
  });

  test("accept an Evidence Ledger that records auditable sources, claims, and visual metrics", () => {
    const ledger = evidenceLedgerSchema.parse({
      sources: [
        {
          sourceId: "S1",
          title: "Evidence-aware writing assistants",
          sourceType: "study",
          url: "https://example.com/study",
          verificationStatus: "verified",
        },
      ],
      claims: [
        {
          claimId: "C1",
          claimText: "Evidence-aware tools can reduce unsupported academic claims.",
          claimType: "factual",
          supportingSourceIds: ["S1"],
          counterSourceIds: [],
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
      metadata: {
        extractionPhase: "screening",
      },
    });

    expect(ledger.sources[0]?.sourceId).toBe("S1");
    expect(ledger.claims[0]?.supportingSourceIds).toEqual(["S1"]);

    expect(() =>
      evidenceLedgerSchema.parse({
        sources: [],
        claims: [],
        visualMetrics: [],
        verificationStatus: "verified",
      }),
    ).toThrow();
  });

  test("accept a Visual Spec that references ledger data without carrying new data", () => {
    const visual = visualSpecSchema.parse({
      visualId: "evidence-timeline",
      visualKind: "timeline",
      title: "Evidence timeline",
      labels: ["2023", "2024"],
      dataReferences: [
        {
          referenceType: "metric",
          referenceId: "M1",
        },
      ],
      sourceIds: ["S1"],
      metricIds: ["M1"],
      caption: "Publication timeline for verified sources.",
      outputIntent: "final_report_embed",
      metadata: {
        renderer: "png",
      },
    });

    expect(visual.metricIds).toEqual(["M1"]);
    expect(visual.outputIntent).toBe("final_report_embed");

    expect(() =>
      visualSpecSchema.parse({
        ...visual,
        dataPoints: [{ label: "Unsupported claims reduced", value: 24 }],
      }),
    ).toThrow();
  });

  test("accept a Research Decision gate without storing raw reasoning or requiring approval for every report", () => {
    const decision = researchDecisionSchema.parse({
      decision: "proceed",
      rationaleSummary: "Enough verified sources support the requested report scope.",
      evidenceGaps: [],
      nextAction: "Assemble the final Markdown report.",
      userConfirmationRequired: false,
      metadata: {
        phase: "decision_loop",
      },
    });

    expect(decision.decision).toBe("proceed");
    expect(decision.userConfirmationRequired).toBe(false);

    expect(() =>
      researchDecisionSchema.parse({
        decision: "pivot",
        rationaleSummary: "The available sources answer a different question.",
        evidenceGaps: ["No source addresses the original population."],
        nextAction: "Ask the user to approve the new scope.",
        userConfirmationRequired: true,
        rawReasoning: "Do not store private model reasoning here.",
      }),
    ).toThrow();
  });

  test("accept an Artifact Manifest for final visual embeds while excluding raw working files", () => {
    const manifest = artifactManifestSchema.parse({
      artifacts: [
        {
          artifactId: "artifact_123",
          visualId: "evidence-timeline",
          status: "passed",
          title: "Evidence timeline",
          caption: "Publication timeline for verified sources.",
          outputIntent: "final_report_embed",
          contentType: "image/png",
          url: "https://utfs.io/f/artifact_123.png",
          fileKey: "artifact_123.png",
          sourceIds: ["S1"],
          metricIds: ["M1"],
        },
        {
          artifactId: "artifact_omitted",
          visualId: "unsupported-chart",
          status: "omitted",
          title: "Unsupported chart",
          caption: "Omitted because the ledger lacks visual-ready metrics.",
          outputIntent: "final_report_embed",
          contentType: "image/png",
          sourceIds: ["S1"],
          metricIds: [],
          reason: "Missing metric references in the Evidence Ledger.",
        },
      ],
      metadata: {
        renderer: "uploadthing-png",
      },
    });

    expect(manifest.artifacts[0]?.status).toBe("passed");
    const omittedArtifact = manifest.artifacts[1];

    if (omittedArtifact?.status !== "omitted") {
      throw new Error("Expected the second artifact to be omitted.");
    }

    expect(omittedArtifact.reason).toContain("Missing metric");

    expect(() =>
      artifactManifestSchema.parse({
        artifacts: [
          {
            artifactId: "raw_evidence_json",
            status: "passed",
            title: "Raw evidence JSON",
            caption: "Raw working file should not be a final visual embed.",
            outputIntent: "final_report_embed",
            contentType: "application/json",
            sourceIds: ["S1"],
            metricIds: [],
            path: "evidence.json",
          },
        ],
      }),
    ).toThrow();
  });
});
