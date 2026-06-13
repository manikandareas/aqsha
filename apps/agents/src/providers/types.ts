import type { ExternalCandidate } from "@aqsha/agent-contracts";
import type { ProviderCache } from "./cache";

export type { ExternalCandidate };

export type JinaReadResult = {
  ok: boolean;
  title: string;
  url: string;
  markdown: string;
  snippet: string;
  failureReason?: string;
};

export type RerankInput = {
  sourceKey: string;
  title: string;
  text: string;
};

export type RerankResult = {
  sourceKey: string;
  score: number;
  rank: number;
};

export type ProviderEnv = {
  exaApiKey?: string;
  jinaApiKey?: string;
  openAlexApiKey?: string;
  crossrefMailto?: string;
};

// Dependency bundle injected into every provider function so tests can stub
// fetch and the cache. Billing + per-user rate limits stay in Convex (plan §3);
// the service only keeps provider-politeness pacing in-process.
export type ProviderDeps = {
  cache: ProviderCache;
  env: ProviderEnv;
  fetchImpl?: typeof fetch;
  /** arXiv global pacer (1 req / 3s). */
  paceArxiv?: () => Promise<void>;
};

export function depsFetch(deps: ProviderDeps): typeof fetch {
  return deps.fetchImpl ?? fetch;
}

export function researchUserAgent(): string {
  return "AqshaResearch/1.0 (+https://aqsha.app)";
}

export function readableError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider failure";
}

export function providerFailure(
  origin: "web" | "arxiv" | "doi",
  reason: string,
  provider?: string,
): ExternalCandidate[] {
  return [
    {
      origin,
      provider,
      evidenceStrength: "weak",
      title: "Provider unavailable",
      locator: reason,
      snippet: `Source lookup failed: ${reason}`,
      metadataJson: JSON.stringify({ providerFailure: true, reason }),
    },
  ];
}

export function providerFailureReason(
  candidate: ExternalCandidate,
): string | null {
  if (candidate.metadataJson) {
    try {
      const metadata = JSON.parse(candidate.metadataJson) as Record<string, unknown>;
      if (metadata.providerFailure === true) {
        return typeof metadata.reason === "string"
          ? metadata.reason
          : candidate.locator;
      }
    } catch {
      // fall through to the title check
    }
  }
  return candidate.title === "Provider unavailable" ? candidate.locator : null;
}
