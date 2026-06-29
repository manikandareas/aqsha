/**
 * Download the first working open-access PDF from an ordered candidate list.
 * Ported from V1 `papers/ingest/download.ts`, with two adaptations:
 *  - Returns the raw bytes (Uint8Array) instead of a Convex `_storage` id — the
 *    V2 BullMQ worker stores the bytes to R2 itself.
 *  - Drops V1's per-user `paperPdfDownloadPerUser` rate-limiter check (Convex).
 *    See the TODO below; the caller/worker is the new place to gate fan-out.
 */

import { fetchWithTimeout, followRedirectsSafely, userAgent } from "./http";
import type { ResolvedPaper } from "./model";

const PDF_FETCH_TIMEOUT_MS = 30_000;
// Mirrors V1 `artifacts/uploadLimits.ts` MAX_UPLOAD_BYTES (50 MiB).
const MAX_UPLOAD_BYTES = 52_428_800;

export async function downloadOaPdf(input: {
  candidates: string[];
}): Promise<{ bytes: Uint8Array; sourceUrl: string; byteSize: number } | null> {
  // TODO(P3+): per-user PDF-download rate limit (was rateLimiter.check/limit
  // on "paperPdfDownloadPerUser"); gate fan-out at the worker boundary.
  if (input.candidates.length === 0) return null;

  for (const candidate of input.candidates) {
    const pdf = await downloadPdfCandidate(candidate);
    if (pdf) return pdf;
  }

  return null;
}

async function downloadPdfCandidate(
  candidate: string,
): Promise<{ bytes: Uint8Array; sourceUrl: string; byteSize: number } | null> {
  try {
    // Redirect manual + guard host (anti-SSRF): candidate berasal dari metadata provider,
    // jadi URL/redirect-nya tak tepercaya. followRedirectsSafely throw utk host internal →
    // catch di bawah melewatkan candidate. Timeout per-hop tetap dari fetchWithTimeout.
    const res = await followRedirectsSafely(candidate, (url) =>
      fetchWithTimeout(url.toString(), {
        redirect: "manual",
        timeoutMs: PDF_FETCH_TIMEOUT_MS,
        headers: { "User-Agent": userAgent(), Accept: "application/pdf,*/*" },
      }),
    );
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) return null;

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!looksLikePdf(bytes) && !contentType.includes("application/pdf")) {
      return null;
    }

    return { bytes, sourceUrl: candidate, byteSize: bytes.length };
  } catch {
    return null;
  }
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

/**
 * Stable, filesystem-safe `.pdf` filename derived from the resolved paper:
 * arXiv id → DOI → title → "paper", sanitised and capped at 80 chars.
 */
export function pdfFileName(resolved: ResolvedPaper): string {
  const base = resolved.arxivId || resolved.doi || resolved.title || "paper";
  const safe = base
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80)
    .toLowerCase();
  return safe.endsWith(".pdf") ? safe : `${safe}.pdf`;
}
