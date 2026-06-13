import type { z } from "zod";

// Minimal strict-JSON extraction client over the Anthropic Messages API. The
// legacy Convex engine used the Vercel AI SDK's generateObject; this service
// deliberately avoids that dependency — we ask the model for STRICT JSON, pull
// the first JSON block out of the text response, and validate it with zod.
// Extraction is best-effort by contract: every failure path (HTTP error,
// unparseable body, schema mismatch, thrown fetch) resolves to null — callers
// degrade to "no claims extracted" and never throw.

export interface JsonLlmClientOptions {
  /** e.g. "https://api.anthropic.com" (no trailing /v1/messages). */
  baseUrl: string;
  /** Sent as `x-api-key` when present (direct Anthropic auth). */
  apiKey?: string;
  /** Sent as `authorization: Bearer …` when no apiKey (gateway auth). */
  authToken?: string;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface JsonExtractRequest<T> {
  model: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
}

export interface JsonLlmClient {
  /** Returns the schema-validated JSON payload, or null on ANY failure. */
  extractJson<T>(req: JsonExtractRequest<T>): Promise<T | null>;
}

const DEFAULT_MAX_TOKENS = 4_096;

const STRICT_JSON_SUFFIX =
  "Respond with ONLY the JSON value described above — no prose, no markdown fences, no explanations.";

// Locate the first complete JSON object/array in a text blob: from the first
// opening brace/bracket, scan for its matching close (string-aware), so prose
// before/after and trailing junk do not break parsing.
export function firstJsonBlock(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function joinTextContent(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const content = (body as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("");
}

export function createAnthropicJsonClient(
  options: JsonLlmClientOptions,
): JsonLlmClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  return {
    async extractJson<T>(req: JsonExtractRequest<T>): Promise<T | null> {
      try {
        const headers: Record<string, string> = {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
        };
        if (options.apiKey) headers["x-api-key"] = options.apiKey;
        else if (options.authToken) {
          headers.authorization = `Bearer ${options.authToken}`;
        }
        const response = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: req.model,
            max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
            messages: [
              {
                role: "user",
                content: `${req.prompt}\n\n${STRICT_JSON_SUFFIX}`,
              },
            ],
          }),
        });
        if (!response.ok) return null;
        const body: unknown = await response.json();
        const text = joinTextContent(body);
        const block = firstJsonBlock(text);
        if (!block) return null;
        const parsed: unknown = JSON.parse(block);
        const validated = req.schema.safeParse(parsed);
        return validated.success ? validated.data : null;
      } catch {
        return null;
      }
    },
  };
}

/** A client that never extracts anything — used when no LLM auth is configured. */
export const nullJsonLlmClient: JsonLlmClient = {
  async extractJson() {
    return null;
  },
};
