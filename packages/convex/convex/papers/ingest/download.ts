import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import { MAX_UPLOAD_BYTES } from "../../artifacts/uploadLimits";
import { rateLimiter } from "../../limits";
import { fetchWithTimeout, userAgent } from "./http";

const PDF_FETCH_TIMEOUT_MS = 30_000;

export async function downloadOaPdf(
  ctx: ActionCtx,
  args: { ownerUserId: string; candidates: string[] },
): Promise<{ storageId: Id<"_storage">; sourceUrl: string; byteSize: number } | null> {
  if (args.candidates.length === 0) return null;
  const allowed = await rateLimiter.check(ctx, "paperPdfDownloadPerUser", {
    key: args.ownerUserId,
  });
  if (!allowed.ok) return null;
  await rateLimiter.limit(ctx, "paperPdfDownloadPerUser", { key: args.ownerUserId });

  for (const candidate of args.candidates) {
    const pdf = await downloadPdfCandidate(ctx, candidate);
    if (pdf) return pdf;
  }

  return null;
}

async function downloadPdfCandidate(
  ctx: ActionCtx,
  candidate: string,
): Promise<{ storageId: Id<"_storage">; sourceUrl: string; byteSize: number } | null> {
  try {
    const res = await fetchWithTimeout(candidate, {
      redirect: "follow",
      timeoutMs: PDF_FETCH_TIMEOUT_MS,
      headers: { "User-Agent": userAgent(), Accept: "application/pdf,*/*" },
    });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    if (bytes.length === 0 || bytes.length > MAX_UPLOAD_BYTES) return null;

    const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
    if (!looksLikePdf(bytes) && !contentType.includes("application/pdf")) {
      return null;
    }

    const storageId = await ctx.storage.store(
      new Blob([buf], { type: "application/pdf" }),
    );
    return { storageId, sourceUrl: candidate, byteSize: bytes.length };
  } catch {
    return null;
  }
}

function looksLikePdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}
