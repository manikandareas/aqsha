import type { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/**
 * Proxy streaming eve (`/eve/v1/*`) → app `@aqsha/agent`.
 *
 * KENAPA `node:http`/`node:https` LANGSUNG, bukan global `fetch` (undici): `fetch` Node
 * memberi `headersTimeout`/`bodyTimeout` default **300 dtk** — waktu maksimum antar-chunk
 * body. Stream eve long-lived bisa DIAM jauh lebih lama dari itu (mis. gap subagent `/deep`
 * terverifikasi 5,7 mnt > 300 dtk tanpa satu byte pun) → undici meng-abort body upstream →
 * koneksi mati → progres BEKU sampai user refresh. Soket `node:http` tak punya idle-timeout
 * default (`setTimeout(0)`) → koneksi long-lived bertahan selama turn berjalan.
 *
 * Body upstream dialirkan APA ADANYA & incremental (`Readable.toWeb`, jaga backpressure) →
 * event tiba real-time. Same-origin tetap terjaga (bearer Clerk diteruskan; channel eve yang
 * verifikasi; `/eve/v1` di-exclude dari Clerk middleware di `proxy.ts`).
 *
 * Menggantikan Next `rewrites()` (yang mem-buffer stream long-lived) DAN proxy berbasis
 * `fetch` (yang kena idle-timeout undici di atas).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AGENT_ORIGIN = process.env.AGENT_ORIGIN ?? "http://localhost:4317";

// Header hop-by-hop yang JANGAN diteruskan (dihitung ulang oleh transport).
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
]);
const DROP_RESPONSE_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

// api origin untuk upsert continuation token (proxy-tee Phase 2). Server-side; reuse
// NEXT_PUBLIC_API_URL (sama dgn klien) kecuali ada override server-only `API_ORIGIN`.
const API_ORIGIN =
  process.env.API_ORIGIN ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Tee token continuation dari respons create/continue eve (`POST /eve/v1/session*` → JSON kecil
 * `{sessionId, continuationToken}`; token TUNGGAL `eve:<uuid>` = nilai yang dipakai live). Upsert
 * RACE-PROOF ke api (bearer sama) supaya jawab HITL `inputResponses` + follow-up lintas-reload
 * punya token andal TANPA bergantung klien menangkap boundary `session.waiting` (akar fix B).
 * Fire-and-forget + idempoten: kegagalan ditolerir (continue-POST berikutnya menulis token sama).
 */
function teeContinuationToken(buf: Buffer, authorization: string | null): void {
  if (!authorization) return;
  try {
    const json = JSON.parse(buf.toString("utf8")) as {
      sessionId?: unknown;
      continuationToken?: unknown;
    };
    const sessionId = typeof json.sessionId === "string" ? json.sessionId : null;
    const token = typeof json.continuationToken === "string" ? json.continuationToken : null;
    if (!sessionId || !token) return;
    void fetch(`${API_ORIGIN}/threads/${encodeURIComponent(sessionId)}/session-token`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ continuationToken: token }),
    }).catch(() => {});
  } catch {
    // Bukan JSON (mustahil di jalur ini: guard content-type) → abaikan.
  }
}

async function proxy(req: NextRequest): Promise<Response> {
  const origin = new URL(AGENT_ORIGIN);
  const transport = origin.protocol === "https:" ? https : http;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) headers[key] = value;
  });

  // Body eve = JSON kecil (create/continue) → buffer; GET/HEAD (stream) tanpa body.
  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer());
  if (body) headers["content-length"] = String(body.byteLength);

  return await new Promise<Response>((resolve, reject) => {
    const upstream = transport.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || undefined,
        method: req.method,
        path: `${req.nextUrl.pathname}${req.nextUrl.search}`,
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const resHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined || DROP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
          resHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        resHeaders.set("x-accel-buffering", "no"); // nginx: jangan buffer (eve sudah set; tegaskan)

        // Tee token dari respons create/continue eve (`POST /eve/v1/session*` → JSON kecil).
        // Stream turn = GET (content-type x-ndjson) → guard `application/json` melewatkannya, jadi
        // buffering hanya menyentuh respons mungil ini, tak pernah stream long-lived.
        const isTokenPost =
          req.method === "POST" &&
          req.nextUrl.pathname.startsWith("/eve/v1/session") &&
          status >= 200 &&
          status < 300 &&
          String(res.headers["content-type"] ?? "").includes("application/json");
        if (isTokenPost) {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const out = Buffer.concat(chunks);
            teeContinuationToken(out, req.headers.get("authorization"));
            resolve(
              new Response(out, { status, statusText: res.statusMessage, headers: resHeaders }),
            );
          });
          res.on("error", reject);
          return;
        }

        // `Readable.toWeb` mengalirkan chunk incremental + menjaga backpressure; abort
        // klien → `cancel` web-stream → `res` di-destroy → koneksi upstream tertutup.
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status,
            statusText: res.statusMessage,
            headers: resHeaders,
          }),
        );
      },
    );

    upstream.setTimeout(0); // TANPA idle-timeout: stream long-lived boleh diam bermenit-menit
    upstream.on("error", reject);
    // Abort klien (tombol stop / unmount / refresh) → tutup koneksi upstream.
    req.signal.addEventListener("abort", () => upstream.destroy(), { once: true });

    if (body) upstream.write(body);
    upstream.end();
  });
}

export const GET = proxy;
export const POST = proxy;
