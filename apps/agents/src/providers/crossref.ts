import { normalizeDoi } from "../lib/identifiers";
import { collapse, trimForSnippet } from "../lib/text";
import {
  depsFetch,
  providerFailure,
  readableError,
  researchUserAgent,
  type ExternalCandidate,
  type ProviderDeps,
} from "./types";

const CROSSREF_ENDPOINT = "https://api.crossref.org/works";

export type CrossrefItem = {
  DOI?: string;
  URL?: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string }>;
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
};

type CrossrefWorkResponse = { message?: CrossrefItem };

export function crossrefToCandidate(item: CrossrefItem): ExternalCandidate | null {
  const doi = normalizeDoi(item.DOI ?? "");
  const title = item.title?.find((value) => value.trim())?.trim();
  if (!doi || !title) {
    return null;
  }
  return {
    origin: "doi",
    evidenceStrength: item.abstract ? "medium" : "weak",
    title: collapse(title),
    locator: doi,
    url: item.URL || `https://doi.org/${doi}`,
    doi,
    snippet:
      trimForSnippet(stripTags(item.abstract)) ||
      trimForSnippet(item["container-title"]?.[0]) ||
      "Crossref metadata only; no abstract text was available.",
    metadataJson: JSON.stringify({
      authors: (item.author ?? [])
        .map((author) => collapse([author.given, author.family].filter(Boolean).join(" ")))
        .filter(Boolean)
        .slice(0, 6),
      year:
        item.published?.["date-parts"]?.[0]?.[0] ??
        item.issued?.["date-parts"]?.[0]?.[0],
      venue: item["container-title"]?.find((value) => value.trim()),
      sourceLabel: item["container-title"]?.find((value) => value.trim()) ?? "Crossref",
    }),
  };
}

export async function lookupDoiProvider(
  deps: ProviderDeps,
  args: { doi: string },
): Promise<ExternalCandidate[]> {
  const doi = normalizeDoi(args.doi);
  if (!doi) {
    return [];
  }
  const cached = deps.cache.get<ExternalCandidate[]>("crossref", doi);
  if (cached) {
    return cached;
  }

  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    if (deps.env.crossrefMailto) {
      url.searchParams.set("mailto", deps.env.crossrefMailto);
    }
    const response = await depsFetch(deps)(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": researchUserAgent(),
      },
    });
    if (!response.ok) {
      throw new Error(`Crossref returned ${response.status}`);
    }
    const json = (await response.json()) as CrossrefWorkResponse;
    const item = json.message;
    const candidates: ExternalCandidate[] = item
      ? [crossrefToCandidate(item)].filter(
          (candidate): candidate is ExternalCandidate => Boolean(candidate),
        )
      : [];
    deps.cache.putCandidates("crossref", doi, candidates);
    return candidates;
  } catch (error) {
    const failure = providerFailure("doi", readableError(error));
    deps.cache.putCandidates("crossref", doi, failure, readableError(error));
    return failure;
  }
}

function stripTags(value: string | undefined): string | undefined {
  return value?.replace(/<[^>]+>/g, " ");
}
