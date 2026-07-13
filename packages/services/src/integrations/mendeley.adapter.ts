import { AppError } from "@aqsha/db";
import type { CslItem } from "../citations/citation-normalize";
import { fetchWithRetry } from "../papers/http";
import type {
  IntegrationAdapter,
  IntegrationProfile,
  MendeleyCredentials,
  ProviderCredentials,
  ProviderDocument,
  ProviderFolder,
} from "./provider";

/**
 * Adapter Mendeley (OAuth2 authorization-code). Endpoint dari Mendeley API v1
 * (`api.mendeley.com`); base URL bisa dioverride via env untuk staging/mock. Semua
 * penulisan credential terjadi di `IntegrationService` — adapter murni protokol.
 * Refresh token otomatis bila access token mendekati expiry (`ensureFresh`).
 */
const DEFAULT_API_BASE = "https://api.mendeley.com";
const SCOPE = "all";
const MAX_PULL_PAGES = 50;
const PAGE_SIZE = 100;
/** Refresh access token bila sisa umur < 60 detik. */
const EXPIRY_SKEW_MS = 60_000;

function apiBase(): string {
  return (process.env.MENDELEY_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function clientCredentials(): { id: string; secret: string } {
  const id = process.env.MENDELEY_CLIENT_ID?.trim();
  const secret = process.env.MENDELEY_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new AppError({
      code: "integration_not_configured",
      message: "MENDELEY_CLIENT_ID / MENDELEY_CLIENT_SECRET belum dikonfigurasi.",
      severity: "error",
      status: 500,
    });
  }
  return { id, secret };
}

function basicAuthHeader(): string {
  const { id, secret } = clientCredentials();
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

type MendeleyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
};

async function requestToken(body: URLSearchParams): Promise<MendeleyTokenResponse> {
  const res = await fetchWithRetry(`${apiBase()}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AppError({
      code: "integration_provider_error",
      message: `Mendeley OAuth gagal (${res.status}). ${detail.slice(0, 200)}`.trim(),
      severity: "error",
      status: res.status === 401 || res.status === 400 ? 400 : 502,
    });
  }
  return (await res.json()) as MendeleyTokenResponse;
}

function credsFromToken(token: MendeleyTokenResponse, prev?: MendeleyCredentials): MendeleyCredentials {
  const refreshToken = token.refresh_token ?? prev?.refreshToken;
  if (!token.access_token || !refreshToken) {
    throw new AppError({
      code: "integration_provider_error",
      message: "Respons token Mendeley tidak lengkap.",
      severity: "error",
      status: 502,
    });
  }
  return {
    provider: "mendeley",
    accessToken: token.access_token,
    refreshToken,
    expiresAt: Date.now() + (token.expires_in ?? 3600) * 1000,
  };
}

function asMendeley(creds: ProviderCredentials): MendeleyCredentials {
  if (creds.provider !== "mendeley") {
    throw new AppError({
      code: "integration_provider_error",
      message: "Kredensial bukan Mendeley.",
      severity: "error",
      status: 500,
    });
  }
  return creds;
}

async function mendeleyGet(
  creds: MendeleyCredentials,
  path: string,
  accept: string,
): Promise<Response> {
  const res = await fetchWithRetry(`${apiBase()}${path}`, {
    headers: { Authorization: `Bearer ${creds.accessToken}`, Accept: accept },
  });
  if (res.status === 401) {
    throw new AppError({
      code: "integration_unauthorized",
      message: "Token Mendeley ditolak — hubungkan ulang akun.",
      severity: "warning",
      status: 401,
    });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new AppError({
      code: "integration_provider_error",
      message: `Mendeley API error (${res.status}).`,
      severity: "error",
      status: 502,
    });
  }
  return res;
}

// ── Mapping dokumen Mendeley → CSL-JSON ───────────────────────────────────────
type MendeleyAuthor = { first_name?: string; last_name?: string };
type MendeleyDocument = {
  id: string;
  title?: string;
  type?: string;
  authors?: MendeleyAuthor[];
  year?: number;
  source?: string;
  publisher?: string;
  abstract?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  edition?: string;
  identifiers?: { doi?: string; isbn?: string; issn?: string; pmid?: string };
  websites?: string[];
};

const TYPE_MAP: Record<string, string> = {
  journal: "article-journal",
  book: "book",
  book_section: "chapter",
  conference_proceedings: "paper-conference",
  thesis: "thesis",
  report: "report",
  working_paper: "report",
  web_page: "webpage",
  magazine_article: "article-magazine",
  newspaper_article: "article-newspaper",
  patent: "patent",
  generic: "document",
};

function mapMendeleyDocument(doc: MendeleyDocument): CslItem {
  const csl: CslItem = { type: TYPE_MAP[doc.type ?? "generic"] ?? "document" };
  if (doc.title) csl.title = doc.title;
  const authors = (doc.authors ?? [])
    .map((a) => {
      const family = a.last_name?.trim();
      const given = a.first_name?.trim();
      if (family && given) return { family, given };
      if (family) return { literal: family };
      if (given) return { literal: given };
      return null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);
  if (authors.length > 0) csl.author = authors;
  if (typeof doc.year === "number") csl.issued = { "date-parts": [[doc.year]] };
  if (doc.source) csl["container-title"] = doc.source;
  if (doc.publisher) csl.publisher = doc.publisher;
  if (doc.volume) csl.volume = doc.volume;
  if (doc.issue) csl.issue = doc.issue;
  if (doc.pages) csl.page = doc.pages;
  if (doc.edition) csl.edition = doc.edition;
  if (doc.identifiers?.doi) csl.DOI = doc.identifiers.doi;
  if (doc.identifiers?.isbn) csl.ISBN = doc.identifiers.isbn;
  if (doc.identifiers?.issn) csl.ISSN = doc.identifiers.issn;
  if (doc.websites?.[0]) csl.URL = doc.websites[0];
  if (doc.abstract) csl.abstract = doc.abstract;
  return csl;
}

/** Ambil URL `rel="next"` dari header Link (pagination Mendeley). */
function nextLink(res: Response): string | null {
  const link = res.headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export const mendeleyAdapter: IntegrationAdapter = {
  provider: "mendeley",
  authMode: "oauth",

  isConfigured(): boolean {
    return Boolean(
      process.env.MENDELEY_CLIENT_ID?.trim() && process.env.MENDELEY_CLIENT_SECRET?.trim(),
    );
  },

  buildAuthorizeUrl({ state, redirectUri }): string {
    const { id } = clientCredentials();
    const url = new URL(`${apiBase()}/oauth/authorize`);
    url.searchParams.set("client_id", id);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", state);
    return url.toString();
  },

  async exchangeCode({ code, redirectUri }): Promise<ProviderCredentials> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    });
    return credsFromToken(await requestToken(body));
  },

  async ensureFresh(creds): Promise<{ creds: ProviderCredentials; refreshed: boolean }> {
    const mendeley = asMendeley(creds);
    if (mendeley.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
      return { creds: mendeley, refreshed: false };
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: mendeley.refreshToken,
    });
    const refreshed = credsFromToken(await requestToken(body), mendeley);
    return { creds: refreshed, refreshed: true };
  },

  async fetchProfile(creds): Promise<IntegrationProfile> {
    const res = await mendeleyGet(
      asMendeley(creds),
      "/profiles/me",
      "application/vnd.mendeley-profile.1+json",
    );
    const profile = (await res.json()) as {
      id?: string;
      display_name?: string;
      first_name?: string;
      last_name?: string;
      email?: string;
    };
    const name =
      profile.display_name ??
      [profile.first_name, profile.last_name].filter(Boolean).join(" ") ??
      undefined;
    return {
      ...(profile.id ? { id: profile.id } : {}),
      ...(name ? { name } : {}),
      ...(profile.email ? { email: profile.email } : {}),
    };
  },

  async listFolders(creds): Promise<ProviderFolder[]> {
    const res = await mendeleyGet(
      asMendeley(creds),
      "/folders",
      "application/vnd.mendeley-folder.1+json",
    );
    const folders = (await res.json()) as Array<{ id: string; name: string; parent_id?: string }>;
    return folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id ?? null,
    }));
  },

  async pullDocuments(creds, { folderId }): Promise<ProviderDocument[]> {
    const mendeley = asMendeley(creds);
    const first = new URL(`${apiBase()}/documents`);
    first.searchParams.set("view", "all");
    first.searchParams.set("limit", String(PAGE_SIZE));
    if (folderId) first.searchParams.set("folder_id", folderId);

    const documents: ProviderDocument[] = [];
    let url: string | null = first.toString();
    for (let page = 0; page < MAX_PULL_PAGES && url; page += 1) {
      const res: Response = await fetchWithRetry(url, {
        headers: {
          Authorization: `Bearer ${mendeley.accessToken}`,
          Accept: "application/vnd.mendeley-document.1+json",
        },
      });
      if (res.status === 401) {
        throw new AppError({
          code: "integration_unauthorized",
          message: "Token Mendeley ditolak — hubungkan ulang akun.",
          severity: "warning",
          status: 401,
        });
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new AppError({
          code: "integration_provider_error",
          message: `Mendeley API error (${res.status}).`,
          severity: "error",
          status: 502,
        });
      }
      const batch = (await res.json()) as MendeleyDocument[];
      for (const doc of batch) {
        documents.push({ externalId: doc.id, csl: mapMendeleyDocument(doc) });
      }
      url = nextLink(res);
    }
    return documents;
  },
};
