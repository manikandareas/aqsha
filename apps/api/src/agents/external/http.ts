import { env } from "../../config";
import { HttpFetchError, ResponseTooLargeError } from "./types";

export type PolitelyFetchOptions = {
  signal?: AbortSignal;
  /** Optional Accept header override. */
  accept?: string;
  /** Additional headers to merge with the default polite UA. */
  headers?: Record<string, string>;
  /** Override timeout for this single call. */
  timeoutMs?: number;
  /** Override the byte cap for this single call. */
  maxBytes?: number;
  /** HTTP method, defaults to GET. */
  method?: "GET" | "POST" | "HEAD";
  /** Body, only honoured when method !== GET/HEAD. */
  body?: BodyInit;
  /**
   * Retry once on 5xx / network errors. Defaults to true.
   * Tools that already implement their own backoff can disable this.
   */
  retry?: boolean;
};

export type PolitelyFetchResult = {
  status: number;
  finalUrl: string;
  contentType: string | null;
  bytes: Uint8Array;
  /** True when reading was capped by `maxBytes`. */
  truncated: boolean;
  headers: Headers;
};

const DEFAULT_RETRYABLE_STATUSES = new Set([502, 503, 504]);

/**
 * Polite HTTP fetch used by every external research tool.
 *
 * Contract:
 *  - Always sends `User-Agent: <ASTRA_HTTP_USER_AGENT>`.
 *  - Honours both the caller's AbortSignal and an internal timeout.
 *  - Aborts and reports `ResponseTooLargeError` if upstream exceeds `maxBytes`.
 *  - Throws `HttpFetchError` on non-2xx status (so callers can branch on `.status`).
 *  - One retry by default for 502/503/504 and connection-reset style failures.
 *
 * The function returns the raw bytes — callers decide how to decode (utf-8 text,
 * binary PDF buffer, etc.).
 */
export async function politelyFetch(
  url: string,
  options: PolitelyFetchOptions = {},
): Promise<PolitelyFetchResult> {
  const retry = options.retry ?? true;

  try {
    return await runFetch(url, options);
  } catch (error) {
    if (!retry || !shouldRetry(error)) {
      throw error;
    }
    return await runFetch(url, options);
  }
}

async function runFetch(
  url: string,
  options: PolitelyFetchOptions,
): Promise<PolitelyFetchResult> {
  const timeoutMs = options.timeoutMs ?? env.ASTRA_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? env.ASTRA_FETCH_MAX_BYTES;
  const method = options.method ?? "GET";

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("fetch timeout")), timeoutMs);

  // Bridge the caller's signal so they can still cancel us early.
  const externalSignal = options.signal;
  const onExternalAbort = () => controller.abort(externalSignal?.reason);
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  try {
    const headers: Record<string, string> = {
      "user-agent": env.ASTRA_HTTP_USER_AGENT,
      ...(options.accept ? { accept: options.accept } : {}),
      ...(options.headers ?? {}),
    };

    const response = await fetch(url, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : options.body,
      signal: controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new HttpFetchError(
        `Upstream ${response.status} for ${url}`,
        url,
        response.status,
      );
    }

    const contentType = response.headers.get("content-type");
    const finalUrl = response.url || url;

    if (method === "HEAD" || !response.body) {
      return {
        status: response.status,
        finalUrl,
        contentType,
        bytes: new Uint8Array(),
        truncated: false,
        headers: response.headers,
      };
    }

    const { bytes, truncated } = await readWithCap(response.body, maxBytes, url);

    return {
      status: response.status,
      finalUrl,
      contentType,
      bytes,
      truncated,
      headers: response.headers,
    };
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

async function readWithCap(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  url: string,
): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        // Cap the result rather than throwing — callers care about whether
        // they got *something* (truncated=true) more than getting an exception.
        const remaining = maxBytes - (total - value.byteLength);
        if (remaining > 0) {
          chunks.push(value.subarray(0, remaining));
        }
        truncated = true;
        // Best-effort cancel; ignore failure (already aborted streams throw).
        try {
          await reader.cancel(new ResponseTooLargeError(
            `Response exceeded ${maxBytes} bytes`,
            url,
            maxBytes,
          ));
        } catch {
          // ignore
        }
        break;
      }
      chunks.push(value);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }

  const bytes = concatChunks(chunks, truncated ? maxBytes : total);
  return { bytes, truncated };
}

function concatChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.byteLength > totalLength) {
      out.set(chunk.subarray(0, totalLength - offset), offset);
      break;
    }
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function shouldRetry(error: unknown): boolean {
  if (error instanceof HttpFetchError) {
    return error.status !== null && DEFAULT_RETRYABLE_STATUSES.has(error.status);
  }
  if (error instanceof ResponseTooLargeError) {
    return false;
  }
  if (error instanceof Error) {
    const message = `${error.name} ${error.message}`.toLowerCase();
    return (
      message.includes("econnreset")
      || message.includes("etimedout")
      || message.includes("network")
      || message.includes("fetch failed")
    );
  }
  return false;
}

// ───────────────────────── content-type helpers ─────────────────────────

export function isHtml(contentType: string | null | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const lower = contentType.toLowerCase();
  return lower.includes("text/html") || lower.includes("application/xhtml");
}

export function isPdf(contentType: string | null | undefined): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes("application/pdf");
}

export function isJson(contentType: string | null | undefined): boolean {
  if (!contentType) {
    return false;
  }
  return contentType.toLowerCase().includes("application/json");
}

export function isXml(contentType: string | null | undefined): boolean {
  if (!contentType) {
    return false;
  }
  const lower = contentType.toLowerCase();
  return lower.includes("/xml") || lower.includes("+xml");
}

// ───────────────────────── decoding helpers ─────────────────────────

/** Decode `bytes` as UTF-8 text (with BOM stripped). */
export function bytesToText(bytes: Uint8Array): string {
  if (bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

/** Convenience: GET → text. Throws `HttpFetchError` on non-2xx. */
export async function fetchText(
  url: string,
  options: PolitelyFetchOptions = {},
): Promise<{ text: string; result: PolitelyFetchResult }> {
  const result = await politelyFetch(url, options);
  return { text: bytesToText(result.bytes), result };
}

/** Convenience: GET → parsed JSON. Throws on parse errors. */
export async function fetchJson<T = unknown>(
  url: string,
  options: PolitelyFetchOptions = {},
): Promise<{ json: T; result: PolitelyFetchResult }> {
  const merged: PolitelyFetchOptions = {
    ...options,
    accept: options.accept ?? "application/json",
  };
  const { text, result } = await fetchText(url, merged);
  if (!text) {
    throw new HttpFetchError(`Empty JSON body from ${url}`, url, result.status);
  }
  return { json: JSON.parse(text) as T, result };
}
