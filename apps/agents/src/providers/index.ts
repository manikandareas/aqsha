import type { AgentsConfig } from "../config";
import { Pacer, ProviderCache } from "./cache";
import { searchExaCandidates } from "./exa";
import { searchJinaCandidates } from "./jina";
import type { ExternalCandidate, ProviderDeps } from "./types";

export { ProviderCache, Pacer } from "./cache";
export * from "./types";
export { searchExaCandidates, readWithExaContents } from "./exa";
export {
  searchJinaCandidates,
  readWithJinaReader,
  jinaRerank,
  parseJinaSearchResponse,
  parseJinaReaderResponse,
} from "./jina";
export { lookupDoiProvider, crossrefToCandidate } from "./crossref";
export { searchArxivProvider, arxivToCandidate } from "./arxiv";
export {
  searchOpenAlexWorks,
  openAlexWorkToCandidate,
  reconstructOpenAlexAbstract,
} from "./openalex";

const ARXIV_MIN_GAP_MS = 3_000;
const ARXIV_MAX_WAIT_MS = 6_000;

/** Build the shared provider dependency bundle for the service process. */
export function buildProviderDeps(config: AgentsConfig): ProviderDeps {
  const pacer = new Pacer(ARXIV_MIN_GAP_MS, ARXIV_MAX_WAIT_MS);
  return {
    cache: new ProviderCache(),
    env: {
      exaApiKey: config.providers.exaApiKey,
      jinaApiKey: config.providers.jinaApiKey,
      openAlexApiKey: config.providers.openAlexApiKey,
      crossrefMailto: config.providers.crossrefMailto,
    },
    paceArxiv: () => pacer.reserve(),
  };
}

/** Exa-first web search with Jina Search fallback (legacy searchWeb contract). */
export async function searchWebProvider(
  deps: ProviderDeps,
  args: { query: string; limit?: number },
): Promise<ExternalCandidate[]> {
  if (deps.env.exaApiKey) {
    const results = await searchExaCandidates(deps, args);
    if (results.length > 0) {
      return results;
    }
  }
  return searchJinaCandidates(deps, args);
}
