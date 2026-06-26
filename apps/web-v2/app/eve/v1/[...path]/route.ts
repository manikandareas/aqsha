import type { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/**
 * Proxy streaming eve (`/eve/v1/*`) → app `@aqsha/agent-v2`.
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
        const resHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined || DROP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
          resHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        resHeaders.set("x-accel-buffering", "no"); // nginx: jangan buffer (eve sudah set; tegaskan)

        // `Readable.toWeb` mengalirkan chunk incremental + menjaga backpressure; abort
        // klien → `cancel` web-stream → `res` di-destroy → koneksi upstream tertutup.
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status: res.statusCode ?? 502,
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
