import type { NextRequest } from "next/server";
import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";

/**
 * Proxy streaming Mastra (`/mastra-api/*`) → app `@aqsha/agent` (server Mastra Hono).
 *
 * `@mastra/client-js` dikonfigurasi `apiPrefix:'/mastra-api'` (same-origin) → memanggil
 * `/mastra-api/agents/:id/stream`, dll. Proxy ini menulis ulang prefix `/mastra-api` → `/api`
 * (apiPrefix server Mastra default) lalu meneruskan ke `MASTRA_AGENT_ORIGIN`.
 *
 * KENAPA `node:http` LANGSUNG (bukan `fetch`/undici): `fetch` Node memberi idle-timeout body
 * 300 dtk; stream Mastra long-lived (mis. `/deep` workflow) bisa diam lebih lama → undici
 * meng-abort → progres beku. Soket `node:http` `setTimeout(0)` = tanpa idle-timeout. Body
 * dialirkan incremental (`Readable.toWeb`, jaga backpressure). Bearer Clerk diteruskan apa
 * adanya; `server.auth` Mastra (MastraAuthClerk) yang memverifikasi; `/mastra-api` di-exclude
 * dari Clerk middleware di `proxy.ts`.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MASTRA_AGENT_ORIGIN = process.env.MASTRA_AGENT_ORIGIN ?? "http://localhost:4111";

const DROP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  // FE-10: respons diteruskan TANPA `content-encoding` (di-strip di bawah) → upstream tak boleh
  // diberi izin kompresi, atau klien menerima byte gzip tanpa header saat ada compressor di depan
  // agent (Hono tak kompres by default — landmine laten, bukan bug aktif).
  "accept-encoding",
]);
const DROP_RESPONSE_HEADERS = new Set([
  "content-length",
  "content-encoding",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

async function proxy(req: NextRequest): Promise<Response> {
  const origin = new URL(MASTRA_AGENT_ORIGIN);
  const transport = origin.protocol === "https:" ? https : http;

  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (!DROP_REQUEST_HEADERS.has(key.toLowerCase())) headers[key] = value;
  });

  const body =
    req.method === "GET" || req.method === "HEAD" ? undefined : Buffer.from(await req.arrayBuffer());
  if (body) headers["content-length"] = String(body.byteLength);

  // `/mastra-api/<rest>` → `/api/<rest>` (apiPrefix server Mastra).
  const targetPath = `${req.nextUrl.pathname.replace(/^\/mastra-api/, "/api")}${req.nextUrl.search}`;

  return await new Promise<Response>((resolve, reject) => {
    const upstream = transport.request(
      {
        protocol: origin.protocol,
        hostname: origin.hostname,
        port: origin.port || undefined,
        method: req.method,
        path: targetPath,
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 502;
        const resHeaders = new Headers();
        for (const [key, value] of Object.entries(res.headers)) {
          if (value === undefined || DROP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
          resHeaders.set(key, Array.isArray(value) ? value.join(", ") : value);
        }
        resHeaders.set("x-accel-buffering", "no"); // nginx: jangan buffer stream
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status,
            statusText: res.statusMessage,
            headers: resHeaders,
          }),
        );
      },
    );

    upstream.setTimeout(0); // tanpa idle-timeout: stream long-lived boleh diam bermenit
    upstream.on("error", reject);
    req.signal.addEventListener("abort", () => upstream.destroy(), { once: true });

    if (body) upstream.write(body);
    upstream.end();
  });
}

export const GET = proxy;
export const POST = proxy;
// FE-10: client-js juga memakai PATCH (`thread.update`), DELETE (`thread.delete`/`deleteMessages`
// bila kelak pindah method), dan PUT — tanpa export, Next membalas 405 sebelum sampai ke agent.
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
