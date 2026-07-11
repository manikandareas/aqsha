import { AppError } from "@aqsha/db";
import type { CslItem } from "../citations/citation-normalize";
import { fetchWithRetry } from "../papers/http";
import type {
  IntegrationAdapter,
  IntegrationProfile,
  ProviderCredentials,
  ProviderDocument,
  ProviderFolder,
  ZoteroCredentials,
} from "./provider";

/**
 * Adapter Zotero (Web API v3, `api.zotero.org`). Connect = API key + user id manual
 * (tanpa OAuth dance) — key divalidasi ke `/keys/<key>` sebelum disimpan. Zotero
 * mengekspor CSL-JSON native (`include=csljson`), jadi mapping ringan: item key →
 * `externalId`, `csljson` → canonical CSL. Paritas alur dengan Mendeley
 * (folders/preview/commit/idempotent). Base URL bisa dioverride via env untuk
 * staging/mock. Semua penulisan credential terjadi di `IntegrationService`.
 */
const DEFAULT_API_BASE = "https://api.zotero.org";
const API_VERSION = "3";
const MAX_PULL_PAGES = 50;
const PAGE_SIZE = 100;

function apiBase(): string {
  return (process.env.ZOTERO_API_BASE?.trim() || DEFAULT_API_BASE).replace(/\/+$/, "");
}

function asZotero(creds: ProviderCredentials): ZoteroCredentials {
  if (creds.provider !== "zotero") {
    throw new AppError({
      code: "integration_provider_error",
      message: "Kredensial bukan Zotero.",
      severity: "error",
      status: 500,
    });
  }
  return creds;
}

function authHeaders(apiKey: string, accept = "application/json"): Record<string, string> {
  return {
    "Zotero-API-Key": apiKey,
    "Zotero-API-Version": API_VERSION,
    Accept: accept,
  };
}

/** GET terautentikasi ke Zotero; 403/401 = key ditolak, non-ok = provider error. */
async function zoteroGet(apiKey: string, url: string): Promise<Response> {
  const res = await fetchWithRetry(url, { headers: authHeaders(apiKey) });
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel().catch(() => {});
    throw new AppError({
      code: "integration_unauthorized",
      message: "API key Zotero ditolak — periksa key atau hubungkan ulang.",
      severity: "warning",
      status: 401,
    });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => {});
    throw new AppError({
      code: "integration_provider_error",
      message: `Zotero API error (${res.status}).`,
      severity: "error",
      status: 502,
    });
  }
  return res;
}

/** Ambil URL `rel="next"` dari header Link (pagination Zotero, sama pola Mendeley). */
function nextLink(res: Response): string | null {
  const link = res.headers.get("link");
  if (!link) return null;
  for (const part of link.split(",")) {
    const match = part.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (match?.[1]) return match[1];
  }
  return null;
}

// ── Bentuk respons Zotero yang dipakai ────────────────────────────────────────
type ZoteroKeyInfo = {
  key?: string;
  userID?: number;
  username?: string;
  access?: { user?: { library?: boolean } };
};
type ZoteroCollection = {
  data?: { key?: string; name?: string; parentCollection?: string | false };
};
type ZoteroItem = { key?: string; csljson?: CslItem };

/** Validasi key + resolusi user id via `/keys/<key>` (userID otoritatif dari Zotero). */
async function fetchKeyInfo(apiKey: string): Promise<ZoteroKeyInfo> {
  const res = await zoteroGet(apiKey, `${apiBase()}/keys/${encodeURIComponent(apiKey)}`);
  return (await res.json()) as ZoteroKeyInfo;
}

/** Zotero mengekspor CSL-JSON native; buang `id` provider agar record assign miliknya. */
function normalizeCsl(csl: CslItem): CslItem {
  const { id: _id, ...rest } = csl as CslItem & { id?: unknown };
  return rest;
}

export const zoteroAdapter: IntegrationAdapter = {
  provider: "zotero",
  authMode: "api_key",

  // Zotero tak butuh client id/secret server — key milik user; readiness = crypto
  // (dinilai terpisah di IntegrationService). Selalu bisa ditawarkan.
  isConfigured(): boolean {
    return true;
  },

  async connectWithApiKey({ apiKey, userId }): Promise<ProviderCredentials> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new AppError({
        code: "integration_credentials_invalid",
        message: "API key Zotero wajib diisi.",
        severity: "warning",
        status: 400,
      });
    }
    const info = await fetchKeyInfo(trimmed);
    if (info.access?.user?.library === false) {
      throw new AppError({
        code: "integration_credentials_invalid",
        message: "API key Zotero tidak punya akses baca perpustakaan pribadi.",
        severity: "warning",
        status: 400,
      });
    }
    const resolvedUserId = info.userID != null ? String(info.userID) : userId?.trim();
    if (!resolvedUserId) {
      throw new AppError({
        code: "integration_credentials_invalid",
        message: "User ID Zotero tidak dapat ditentukan dari API key.",
        severity: "warning",
        status: 400,
      });
    }
    return { provider: "zotero", apiKey: trimmed, userId: resolvedUserId };
  },

  // Zotero API key tak kedaluwarsa → tak ada yang perlu di-refresh.
  async ensureFresh(creds): Promise<{ creds: ProviderCredentials; refreshed: boolean }> {
    return { creds: asZotero(creds), refreshed: false };
  },

  async fetchProfile(creds): Promise<IntegrationProfile> {
    const zotero = asZotero(creds);
    const info = await fetchKeyInfo(zotero.apiKey);
    const id = info.userID != null ? String(info.userID) : zotero.userId;
    return {
      ...(id ? { id } : {}),
      ...(info.username ? { name: info.username } : {}),
    };
  },

  async listFolders(creds): Promise<ProviderFolder[]> {
    const zotero = asZotero(creds);
    const first = new URL(`${apiBase()}/users/${encodeURIComponent(zotero.userId)}/collections`);
    first.searchParams.set("format", "json");
    first.searchParams.set("limit", String(PAGE_SIZE));

    const folders: ProviderFolder[] = [];
    let url: string | null = first.toString();
    for (let page = 0; page < MAX_PULL_PAGES && url; page += 1) {
      const res = await zoteroGet(zotero.apiKey, url);
      const batch = (await res.json()) as ZoteroCollection[];
      for (const col of batch) {
        const key = col.data?.key;
        if (!key) continue;
        folders.push({
          id: key,
          name: col.data?.name ?? "(tanpa nama)",
          parentId: col.data?.parentCollection ? col.data.parentCollection : null,
        });
      }
      url = nextLink(res);
    }
    return folders;
  },

  async pullDocuments(creds, { folderId }): Promise<ProviderDocument[]> {
    const zotero = asZotero(creds);
    const prefix = `${apiBase()}/users/${encodeURIComponent(zotero.userId)}`;
    // `/items/top` mengecualikan attachment/note anak; koleksi tertentu → items/top-nya.
    const path = folderId
      ? `${prefix}/collections/${encodeURIComponent(folderId)}/items/top`
      : `${prefix}/items/top`;
    const first = new URL(path);
    first.searchParams.set("format", "json");
    first.searchParams.set("include", "csljson");
    first.searchParams.set("limit", String(PAGE_SIZE));

    const documents: ProviderDocument[] = [];
    let url: string | null = first.toString();
    for (let page = 0; page < MAX_PULL_PAGES && url; page += 1) {
      const res = await zoteroGet(zotero.apiKey, url);
      const batch = (await res.json()) as ZoteroItem[];
      for (const item of batch) {
        // Standalone note/attachment top-level tak punya csljson bermakna → lewati.
        if (!item.key || !item.csljson || typeof item.csljson !== "object" || !item.csljson.type) {
          continue;
        }
        documents.push({ externalId: item.key, csl: normalizeCsl(item.csljson) });
      }
      url = nextLink(res);
    }
    return documents;
  },
};
