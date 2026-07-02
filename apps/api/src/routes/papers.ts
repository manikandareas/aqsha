import {
  BlockedUrlError,
  ExploreService,
  followRedirectsSafely,
  isBlockedHost,
} from "@aqsha/services";
import { Elysia, status, t } from "elysia";
import { getDb } from "../clients/db";
import { authMacro } from "../plugins/auth";
import { rateLimitMacro } from "../plugins/rate-limit";

// Cache provenance URL ter-validasi (anti seq-scan berulang: pdf.js menembak
// beberapa range request per dokumen). TTL pendek → entri di-revalidasi berkala
// (URL yang dihapus/diubah di DB tak terus dilayani); evict entri terlama saat cap.
const knownPdfUrls = new Map<string, number>(); // url → kedaluwarsa (epoch ms)
const KNOWN_PDF_URL_CAP = 2_000;
const KNOWN_PDF_URL_TTL_MS = 10 * 60_000;
// Batas waktu connect + header + redirect (BUKAN streaming body — body besar tak boleh
// terpotong di tengah). Lihat fetchPdfUpstream.
const PDF_PROXY_TIMEOUT_MS = 15_000;
const PDF_PROXY_MAX_BYTES = 60 * 1024 * 1024; // 60MB — tolak PDF raksasa (anti egress-amplify)

function isPdfUrlCached(u: string): boolean {
  const exp = knownPdfUrls.get(u);
  if (exp == null) return false;
  if (exp <= Date.now()) {
    knownPdfUrls.delete(u);
    return false;
  }
  return true;
}

function cachePdfUrl(u: string): void {
  // Map menjaga urutan-insert → evict entri terlama saat penuh (bukan clear total,
  // yang memicu thundering re-validasi).
  if (knownPdfUrls.size >= KNOWN_PDF_URL_CAP) {
    const oldest = knownPdfUrls.keys().next().value;
    if (oldest !== undefined) knownPdfUrls.delete(oldest);
  }
  knownPdfUrls.set(u, Date.now() + KNOWN_PDF_URL_TTL_MS);
}

type PdfFetchResult =
  | { ok: true; res: Response }
  | { ok: false; code: 400 | 502; message: string };

/**
 * Ambil PDF upstream lewat guard SSRF bersama `followRedirectsSafely` (https + host
 * tak-diblok di tiap hop). Deadline hanya membungkus connect+header+redirect; di-clear
 * sebelum body distream agar PDF besar tak terpotong di tengah (fix timeout-mid-stream).
 */
async function fetchPdfUpstream(target: URL, range: string | null): Promise<PdfFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_PROXY_TIMEOUT_MS);
  try {
    const res = await followRedirectsSafely(target.toString(), (url) =>
      fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "application/pdf,*/*",
          "User-Agent": "AqshaBot/1.0 (+https://aqsha.id)",
          ...(range ? { Range: range } : {}),
        },
      }),
    );
    return { ok: true, res };
  } catch (err) {
    if (err instanceof BlockedUrlError) return { ok: false, code: 400, message: err.message };
    return { ok: false, code: 502, message: "Gagal mengambil PDF" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Route papers/explore (Domain 9, P4 + Fase 8). `GET /papers/search` (waterfall akademik
 * OpenAlex→arXiv→Crossref + cache; GRATIS, rate-limit `explore:search`; load-more via `page`),
 * `GET /papers/detail?key=…` (getPaperDetail: cache + OpenAlex single-work enrichment).
 *
 * Kunci kanonik (`doi:`/`arxiv:`/`url:`/`title:`) DIBAWA SEBAGAI QUERY PARAM, bukan path:
 * hampir semua key mengandung `/` (DOI `10.x/y`, `url:https://…`) yang akan memecah path
 * segment dan menjadikan rute `:key` tak match (404). Eden encode query param + Elysia decode
 * query → round-trip aman; juga menghindari jebakan `%2F` di reverse-proxy.
 */
export const papers = new Elysia({ prefix: "/papers" })
  .use(authMacro)
  .use(rateLimitMacro)
  .get(
    "/search",
    ({ ownerUserId, query }) => {
      const { db } = getDb();
      return ExploreService.searchPapers(db, ownerUserId, {
        query: query.query,
        limit: query.limit,
        mode: query.mode,
        fromYear: query.fromYear,
        page: query.page,
        interestSeed: query.interestSeed,
      });
    },
    {
      auth: true,
      rateLimit: "explore:search",
      query: t.Object({
        query: t.Optional(t.String()),
        limit: t.Optional(t.Numeric()),
        mode: t.Optional(t.Union([t.Literal("recommendations"), t.Literal("search")])),
        fromYear: t.Optional(t.Numeric()),
        page: t.Optional(t.Numeric()),
        interestSeed: t.Optional(t.Boolean()),
      }),
    },
  )
  .get(
    "/detail",
    ({ query }) => {
      const { db } = getDb();
      return ExploreService.getPaperDetail(db, query.key, {
        fetchOnMiss: query.fetchOnMiss,
      });
    },
    {
      auth: true,
      query: t.Object({
        key: t.String(),
        fetchOnMiss: t.Optional(t.Boolean()),
      }),
    },
  )
  // PDF proxy untuk thumbnail Explore (pdf.js render halaman-1). PUBLIK (cuma melayani
  // PDF open-access yang sudah kita ingest) + provenance-checked & anti-SSRF (redirect
  // manual, host internal diblok, content-type di-allowlist, ukuran dibatasi). Range
  // header diteruskan → pdf.js cukup tarik chunk halaman pertama (butuh expose-headers CORS).
  .get(
    "/pdf-proxy",
    async ({ query, request, set }) => {
      let target: URL;
      try {
        target = new URL(query.u);
      } catch {
        return status(400, { message: "URL tidak valid", code: "bad_request" });
      }
      if (target.protocol !== "https:") {
        return status(400, { message: "Hanya https", code: "bad_request" });
      }
      if (isBlockedHost(target.hostname)) {
        return status(400, { message: "Host tidak diizinkan", code: "bad_request" });
      }

      if (!isPdfUrlCached(query.u)) {
        const { db } = getDb();
        const known = await ExploreService.isKnownPdfUrl(db, query.u);
        if (!known) {
          return status(404, { message: "PDF tidak dikenal", code: "not_found" });
        }
        cachePdfUrl(query.u);
      }

      const range = request.headers.get("range");
      const result = await fetchPdfUpstream(target, range);
      if (!result.ok) {
        return status(result.code, { message: result.message, code: "bad_gateway" });
      }
      const upstream = result.res;
      if (!upstream.ok && upstream.status !== 206) {
        await upstream.body?.cancel().catch(() => {});
        return status(502, { message: "Sumber PDF menolak", code: "bad_gateway" });
      }

      // Allowlist content-type: paywall/login sering balas html/json/teks (200) yang akan
      // bikin pdf.js "Invalid PDF structure". Hanya PDF / octet-stream / tanpa tipe yang lolos.
      const upstreamType = (upstream.headers.get("content-type") ?? "").toLowerCase();
      const looksPdf =
        upstreamType === "" ||
        upstreamType.includes("application/pdf") ||
        upstreamType.includes("octet-stream");
      if (!looksPdf) {
        await upstream.body?.cancel().catch(() => {});
        return status(415, { message: "Bukan PDF", code: "unsupported_media_type" });
      }

      // Tolak PDF raksasa (anti egress-amplify pada endpoint publik). Best-effort dari
      // header — upstream bisa bohong, tapi memotong kasus paling kasar.
      const contentLength = upstream.headers.get("content-length");
      if (contentLength && Number(contentLength) > PDF_PROXY_MAX_BYTES) {
        await upstream.body?.cancel().catch(() => {});
        return status(413, { message: "PDF terlalu besar", code: "payload_too_large" });
      }
      if (!upstream.body) {
        return status(502, { message: "Sumber PDF kosong", code: "bad_gateway" });
      }

      // set.headers (bukan Response manual) → plugin cors() menambah CORS seragam,
      // tak ada Access-Control-Allow-Origin ganda. Body stream diteruskan apa adanya.
      set.status = upstream.status;
      set.headers["content-type"] = "application/pdf";
      set.headers["accept-ranges"] = "bytes";
      set.headers["cache-control"] = "public, max-age=86400";
      const contentRange = upstream.headers.get("content-range");
      if (contentRange) set.headers["content-range"] = contentRange;
      if (contentLength) set.headers["content-length"] = contentLength;

      return upstream.body;
    },
    { query: t.Object({ u: t.String() }) },
  );
