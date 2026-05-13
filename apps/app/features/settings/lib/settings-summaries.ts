export type SourceSummary = {
  total: number;
  ready: number;
  metadataOnly: number;
  failed: number;
  indexing: number;
};

export function summarizeSources(sources: Array<{ status: string }>): SourceSummary {
  return sources.reduce<SourceSummary>(
    (summary, source) => {
      summary.total += 1;
      if (source.status === "ready") summary.ready += 1;
      else if (source.status === "metadata_only") summary.metadataOnly += 1;
      else if (source.status === "failed") summary.failed += 1;
      else summary.indexing += 1;
      return summary;
    },
    { total: 0, ready: 0, metadataOnly: 0, failed: 0, indexing: 0 },
  );
}

export function usagePercentage(current: { creditsUsed: number; creditsLimit: number }) {
  return Math.min(
    100,
    Math.round((current.creditsUsed / Math.max(1, current.creditsLimit)) * 100),
  );
}
