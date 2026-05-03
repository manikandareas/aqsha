import type { EvidenceLedger, VisualSpec } from "./contracts";

export type VisualSpecReferenceAuditIssue = {
  code: "missing_source" | "missing_claim" | "missing_metric";
  message: string;
  referenceId: string;
};

export function auditVisualSpecReferences(
  visual: VisualSpec,
  ledger: EvidenceLedger,
): VisualSpecReferenceAuditIssue[] {
  const sourceIds = new Set(ledger.sources.map((source) => source.sourceId));
  const claimIds = new Set(ledger.claims.map((claim) => claim.claimId));
  const metricIds = new Set(ledger.visualMetrics.map((metric) => metric.metricId));
  const issues: VisualSpecReferenceAuditIssue[] = [];

  collectMissing(visual.sourceIds, sourceIds, issues, "missing_source", "source ID");
  collectMissing(visual.claimIds, claimIds, issues, "missing_claim", "claim ID");
  collectMissing(visual.metricIds, metricIds, issues, "missing_metric", "metric ID");

  for (const reference of visual.dataReferences) {
    if (reference.referenceType === "source") {
      collectMissing([reference.referenceId], sourceIds, issues, "missing_source", "source ID");
    }

    if (reference.referenceType === "claim") {
      collectMissing([reference.referenceId], claimIds, issues, "missing_claim", "claim ID");
    }

    if (reference.referenceType === "metric") {
      collectMissing([reference.referenceId], metricIds, issues, "missing_metric", "metric ID");
    }
  }

  return dedupeIssues(issues);
}

function collectMissing(
  references: string[],
  knownIds: Set<string>,
  issues: VisualSpecReferenceAuditIssue[],
  code: VisualSpecReferenceAuditIssue["code"],
  label: string,
) {
  for (const referenceId of references) {
    if (knownIds.has(referenceId)) {
      continue;
    }

    issues.push({
      code,
      message: `Visual Spec references unknown ${label}: ${referenceId}`,
      referenceId,
    });
  }
}

function dedupeIssues(issues: VisualSpecReferenceAuditIssue[]): VisualSpecReferenceAuditIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.code}:${issue.referenceId}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}
