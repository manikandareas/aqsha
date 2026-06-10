import { XMLParser } from "fast-xml-parser";
import type { ActionCtx } from "../../_generated/server";
import {
  reconstructOpenAlexAbstract,
  type OpenAlexWork,
} from "../../agent/providers/openalexProvider";
import { asArray } from "../../lib/arrays";
import { collapse, numberOrUndefined } from "../../lib/text";
import { arxivAbsUrl, arxivPdfUrl, normalizeDoi } from "./identifiers";
import { contactEmail, fetchWithTimeout, globalThrottle, userAgent } from "./http";
import type { ArxivPartial, PartialPaper } from "./model";

const OPENALEX_ENDPOINT = "https://api.openalex.org/works";
const CROSSREF_ENDPOINT = "https://api.crossref.org/works";
const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";
const UNPAYWALL_ENDPOINT = "https://api.unpaywall.org/v2";
const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper";

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

export async function openAlexByDoi(
  ctx: ActionCtx,
  doi: string,
): Promise<PartialPaper | null> {
  if (!(await globalThrottle(ctx, "openAlexSearchGlobal"))) return null;
  try {
    const url = new URL(`${OPENALEX_ENDPOINT}/doi:${encodeURIComponent(doi)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const apiKey = process.env.OPENALEX_API_KEY;
    if (apiKey) url.searchParams.set("api_key", apiKey);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    return openAlexWorkToPartial((await res.json()) as OpenAlexWork);
  } catch {
    return null;
  }
}

export async function openAlexByPmid(
  ctx: ActionCtx,
  pmid: string,
): Promise<PartialPaper | null> {
  if (!(await globalThrottle(ctx, "openAlexSearchGlobal"))) return null;
  try {
    const url = new URL(`${OPENALEX_ENDPOINT}/pmid:${encodeURIComponent(pmid)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    return openAlexWorkToPartial((await res.json()) as OpenAlexWork);
  } catch {
    return null;
  }
}

function openAlexWorkToPartial(work: OpenAlexWork): PartialPaper {
  const location = work.best_oa_location ?? work.primary_location ?? null;
  return {
    doi: work.doi ? normalizeDoi(work.doi) : undefined,
    title: collapse(work.display_name ?? work.title ?? "") || undefined,
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index) || undefined,
    authors: (work.authorships ?? [])
      .map((a) => ({
        name: collapse(a.author?.display_name ?? a.raw_author_name ?? ""),
        affiliation: a.institutions?.[0]?.display_name ?? undefined,
      }))
      .filter((a) => a.name),
    journal: collapse(location?.source?.display_name ?? "") || undefined,
    publisher: collapse(location?.source?.host_organization_name ?? "") || undefined,
    publishedYear: numberOrUndefined(work.publication_year),
    metadataSource: "openalex",
    oaStatus: work.open_access?.oa_status ?? undefined,
    pdfCandidates: compact([
      work.best_oa_location?.pdf_url,
      work.open_access?.oa_url,
      ...(work.locations ?? []).map((loc) => loc.pdf_url),
    ]),
    landingPageUrl: location?.landing_page_url ?? undefined,
  };
}

type CrossrefWork = {
  message?: {
    DOI?: string;
    title?: string[];
    author?: Array<{
      given?: string;
      family?: string;
      name?: string;
      affiliation?: Array<{ name?: string }>;
    }>;
    "container-title"?: string[];
    publisher?: string;
    issued?: { "date-parts"?: number[][] };
    published?: { "date-parts"?: number[][] };
  };
};

export async function crossrefByDoi(
  ctx: ActionCtx,
  doi: string,
): Promise<PartialPaper | null> {
  if (!(await globalThrottle(ctx, "crossrefLookupGlobal"))) return null;
  try {
    const url = new URL(`${CROSSREF_ENDPOINT}/${encodeURIComponent(doi)}`);
    const email = contactEmail();
    if (email) url.searchParams.set("mailto", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    const m = ((await res.json()) as CrossrefWork).message;
    if (!m) return null;
    const year =
      m.issued?.["date-parts"]?.[0]?.[0] ?? m.published?.["date-parts"]?.[0]?.[0];
    return {
      doi: m.DOI ? normalizeDoi(m.DOI) : doi,
      title: collapse(m.title?.[0] ?? "") || undefined,
      authors: (m.author ?? [])
        .map((a) => ({
          name: collapse(a.name ?? `${a.given ?? ""} ${a.family ?? ""}`),
          affiliation: a.affiliation?.[0]?.name,
        }))
        .filter((a) => a.name),
      journal: collapse(m["container-title"]?.[0] ?? "") || undefined,
      publisher: collapse(m.publisher ?? "") || undefined,
      publishedYear: numberOrUndefined(year),
      metadataSource: "crossref",
    };
  } catch {
    return null;
  }
}

type ArxivEntry = {
  title?: string;
  summary?: string;
  published?: string;
  doi?: string;
  journal_ref?: string;
  author?: { name?: string } | Array<{ name?: string }>;
};

export async function arxivById(
  ctx: ActionCtx,
  arxivId: string,
): Promise<ArxivPartial | null> {
  if (!(await globalThrottle(ctx, "arxivSearchGlobal"))) return null;
  try {
    const url = new URL(ARXIV_ENDPOINT);
    url.searchParams.set("id_list", arxivId);
    url.searchParams.set("max_results", "1");
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/atom+xml", "User-Agent": userAgent() },
      timeoutMs: 20_000,
    });
    if (!res.ok) return null;
    const feed = xmlParser.parse(await res.text()) as {
      feed?: { entry?: ArxivEntry | ArxivEntry[] };
    };
    const entry = asArray(feed.feed?.entry)[0];
    if (!entry) return null;
    return {
      arxivId,
      title: collapse(typeof entry.title === "string" ? entry.title : "") || undefined,
      abstract: collapse(typeof entry.summary === "string" ? entry.summary : "") || undefined,
      authors: asArray(entry.author)
        .map((a) => ({ name: collapse(a?.name ?? "") }))
        .filter((a) => a.name),
      publishedYear: yearFromIso(entry.published),
      publishedDoi:
        typeof entry.doi === "string" ? normalizeDoi(entry.doi) : undefined,
      journal:
        collapse(typeof entry.journal_ref === "string" ? entry.journal_ref : "") ||
        undefined,
      metadataSource: "arxiv",
      pdfCandidates: [arxivPdfUrl(arxivId)],
      landingPageUrl: arxivAbsUrl(arxivId),
    };
  } catch {
    return null;
  }
}

export async function unpaywallByDoi(
  ctx: ActionCtx,
  doi: string,
): Promise<{ pdfUrl?: string; oaStatus?: string } | null> {
  const email = process.env.UNPAYWALL_EMAIL || contactEmail();
  if (!email) return null;
  if (!(await globalThrottle(ctx, "unpaywallGlobal"))) return null;
  try {
    const url = new URL(`${UNPAYWALL_ENDPOINT}/${encodeURIComponent(doi)}`);
    url.searchParams.set("email", email);
    const res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": userAgent() },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      oa_status?: string;
      best_oa_location?: { url_for_pdf?: string | null } | null;
      oa_locations?: Array<{ url_for_pdf?: string | null }> | null;
    };
    const pdfUrl =
      json.best_oa_location?.url_for_pdf ??
      json.oa_locations?.find((location) => location.url_for_pdf)?.url_for_pdf ??
      undefined;
    return { pdfUrl: pdfUrl ?? undefined, oaStatus: json.oa_status };
  } catch {
    return null;
  }
}

export async function semanticScholar(
  ctx: ActionCtx,
  id: { doi?: string; arxivId?: string },
): Promise<{ abstract?: string; pdfUrl?: string } | null> {
  const paperId = id.doi ? `DOI:${id.doi}` : id.arxivId ? `ARXIV:${id.arxivId}` : null;
  if (!paperId) return null;
  if (!(await globalThrottle(ctx, "semanticScholarGlobal"))) return null;
  try {
    const url = new URL(`${S2_ENDPOINT}/${encodeURIComponent(paperId)}`);
    url.searchParams.set("fields", "abstract,externalIds,openAccessPdf");
    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": userAgent(),
    };
    const key = process.env.SEMANTIC_SCHOLAR_API_KEY;
    if (key) headers["x-api-key"] = key;
    const res = await fetchWithTimeout(url.toString(), { headers });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      abstract?: string | null;
      openAccessPdf?: { url?: string | null } | null;
    };
    return {
      abstract: json.abstract ?? undefined,
      pdfUrl: json.openAccessPdf?.url ?? undefined,
    };
  } catch {
    return null;
  }
}

type DataCiteResponse = {
  data?: {
    attributes?: {
      titles?: Array<{ title?: string }>;
      creators?: Array<{
        name?: string;
        givenName?: string;
        familyName?: string;
      }>;
      publicationYear?: number;
      publisher?: string;
      descriptions?: Array<{ description?: string; descriptionType?: string }>;
    };
  };
};

export async function dataCiteByDoi(doi: string): Promise<PartialPaper | null> {
  try {
    const res = await fetchWithTimeout(
      `https://api.datacite.org/dois/${encodeURIComponent(doi)}`,
      {
        headers: { Accept: "application/json", "User-Agent": userAgent() },
        timeoutMs: 15_000,
      },
    );
    if (!res.ok) return null;
    const attr = ((await res.json()) as DataCiteResponse).data?.attributes;
    if (!attr) return null;
    const abstract = attr.descriptions?.find(
      (d) => (d.descriptionType ?? "").toLowerCase() === "abstract",
    )?.description;
    return {
      title: collapse(attr.titles?.[0]?.title ?? "") || undefined,
      abstract: collapse(abstract ?? "") || undefined,
      authors: (attr.creators ?? [])
        .map((c) => ({
          name: collapse(c.name ?? `${c.givenName ?? ""} ${c.familyName ?? ""}`),
        }))
        .filter((a) => a.name),
      publisher: collapse(attr.publisher ?? "") || undefined,
      publishedYear: numberOrUndefined(attr.publicationYear),
      metadataSource: "datacite",
    };
  } catch {
    return null;
  }
}

function compact(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value && value.trim()));
}

function yearFromIso(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})/);
  return match ? Number(match[1]) : undefined;
}
