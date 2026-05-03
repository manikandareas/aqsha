import type { EvidenceLedger } from "./contracts";

type DeliveryEvent = {
  type: string;
  scope: "run" | "tool" | "error";
  status: "completed" | "failed";
  title: string;
  summary: string;
  payload: {
    failureSummary?: string;
    developerDetail?: unknown;
    [key: string]: unknown;
  };
};

type DeliveryArtifact = {
  status: "pending" | "passed" | "omitted" | "failed";
  title: string;
  failureSummary?: string | null;
  developerDetail?: unknown;
};

export type DeepResearchDeliveryInput = {
  finalReportMarkdown: string;
  evidenceLedger: EvidenceLedger;
  primaryDeliverable?: "report" | "visual";
  artifacts: DeliveryArtifact[];
};

export type DeepResearchDeliveryResult =
  | {
      status: "failed";
      runStatus: "failed";
      assistantMessage: string;
      events: DeliveryEvent[];
    }
  | {
      status: "completed";
      runStatus: "completed";
      finalReportMarkdown: string;
      events: DeliveryEvent[];
    };

type EvidenceAuditIssue = {
  code:
    | "important_claim_unverified"
    | "important_claim_insufficient"
    | "important_claim_unknown_source";
  claimId: string;
  message: string;
};

export function evaluateDeepResearchDelivery(
  input: DeepResearchDeliveryInput,
): DeepResearchDeliveryResult {
  const evidenceIssues = auditImportantClaims(input.evidenceLedger);

  if (evidenceIssues.length > 0) {
    const failureSummary = `Evidence audit failed for important claims: ${[
      ...new Set(evidenceIssues.map((issue) => issue.claimId)),
    ].join(", ")}.`;

    return {
      status: "failed",
      runStatus: "failed",
      assistantMessage: [
        "Deep Research could not deliver a final report because important claims failed citation/evidence audit.",
        "",
        failureSummary,
        "",
        "Next step: refine the evidence ledger or pivot the research scope before generating the final report.",
      ].join("\n"),
      events: [
        {
          type: "evidence_audit_failed",
          scope: "error",
          status: "failed",
          title: "Evidence audit failed",
          summary: failureSummary,
          payload: {
            failureSummary,
            developerDetail: {
              issues: evidenceIssues,
            },
          },
        },
      ],
    };
  }

  const failedVisualArtifacts = input.artifacts.filter(
    (artifact) => artifact.status === "failed" || artifact.status === "omitted",
  );

  if (input.primaryDeliverable === "visual" && failedVisualArtifacts.length > 0) {
    const failureSummary =
      failedVisualArtifacts[0]?.failureSummary ??
      "The requested primary visual artifact could not be delivered.";

    return {
      status: "failed",
      runStatus: "failed",
      assistantMessage: [
        "Deep Research could not deliver the requested primary visual artifact.",
        "",
        failureSummary,
        "",
        "Next step: fix the visual artifact failure or refine the requested deliverable.",
      ].join("\n"),
      events: failedVisualArtifacts.map((artifact) => {
        const artifactFailureSummary =
          artifact.failureSummary ??
          `${artifact.title} could not be delivered as the primary visual artifact.`;

        return {
          type: "visual_artifact_failed",
          scope: "error",
          status: "failed",
          title: "Primary visual artifact failed",
          summary: artifactFailureSummary,
          payload: {
            artifactTitle: artifact.title,
            failureSummary: artifactFailureSummary,
            developerDetail: artifact.developerDetail ?? null,
          },
        };
      }),
    };
  }

  const visualOmissions = input.artifacts.filter(
    (artifact) => artifact.status === "omitted" || artifact.status === "failed",
  );

  if (visualOmissions.length > 0) {
    return {
      status: "completed",
      runStatus: "completed",
      finalReportMarkdown: input.finalReportMarkdown,
      events: visualOmissions.map((artifact) => {
        const failureSummary =
          artifact.failureSummary ??
          `${artifact.title} was omitted because it was not safe to include.`;

        return {
          type: "visual_omitted",
          scope: "tool",
          status: "completed",
          title: "Visual omitted",
          summary: failureSummary,
          payload: {
            artifactTitle: artifact.title,
            failureSummary,
            developerDetail: artifact.developerDetail ?? null,
          },
        };
      }),
    };
  }

  return {
    status: "completed",
    runStatus: "completed",
    finalReportMarkdown: input.finalReportMarkdown,
    events: [],
  };
}

function auditImportantClaims(ledger: EvidenceLedger): EvidenceAuditIssue[] {
  const sourceIds = new Set(ledger.sources.map((source) => source.sourceId));
  const issues: EvidenceAuditIssue[] = [];

  for (const claim of ledger.claims) {
    if (claim.verificationStatus !== "verified") {
      issues.push({
        code: "important_claim_unverified",
        claimId: claim.claimId,
        message: `Important Claim ${claim.claimId} is ${claim.verificationStatus}.`,
      });
    }

    if (claim.evidenceStrength === "insufficient") {
      issues.push({
        code: "important_claim_insufficient",
        claimId: claim.claimId,
        message: `Important Claim ${claim.claimId} has insufficient evidence strength.`,
      });
    }

    for (const sourceId of claim.supportingSourceIds) {
      if (!sourceIds.has(sourceId)) {
        issues.push({
          code: "important_claim_unknown_source",
          claimId: claim.claimId,
          message: `Important Claim ${claim.claimId} references unknown Ledger Source ID ${sourceId}.`,
        });
      }
    }
  }

  return issues;
}
