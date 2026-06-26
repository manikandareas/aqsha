/**
 * Saran query Explore (typeahead) — LLM murah ubah ketikan parsial user jadi 4–6 frasa
 * pencarian riset yang lebih utuh (Bahasa Indonesia). Pakai instance "fast model" terpisah
 * (clients/fast-model.ts) yang URL+model+key-nya configurable via env (AQSHA_FAST_MODEL*).
 * Cache Redis per-prefix (external-cache) supaya keystroke berulang tak bayar LLM. Soft-fail:
 * error/model down → `[]` (UI degrade ke live-search biasa).
 */
import { generateText } from "ai";
import { fastModel } from "../clients/fast-model";
import { getCache, putCache } from "../papers/external-cache";
import { normalizeKey } from "../lib/text";

const MIN_CHARS = 2;
const MAX_SUGGESTIONS = 6;

/** Parse output LLM (satu frasa per baris) → daftar bersih: buang bullet/nomor/kutip, dedupe, cap. */
export function parseSuggestions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw
      .replace(/^[\s\-*•\d.)("']+/, "")
      .replace(/["']+$/, "")
      .trim();
    if (line.length < 2 || line.length > 120) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * Satu pemanggilan LLM saran ber-cache (namespace `openai_suggest`) + soft-fail → [].
 * Inti bersama deriveSubtopics & suggestQueries: cache get → generate → parse → cache put.
 */
async function cachedSuggest(cacheKey: string, prompt: string, cap: number): Promise<string[]> {
  const cached = await getCache("openai_suggest", cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as string[];
    } catch {
      // fall through ke live
    }
  }
  try {
    const { text } = await generateText({ model: fastModel(), prompt });
    const out = parseSuggestions(text).slice(0, cap);
    await putCache("openai_suggest", cacheKey, out.length > 0 ? "ready" : "empty", JSON.stringify(out));
    return out;
  } catch {
    return [];
  }
}

/**
 * Subtopik/aspek riset dari sebuah topik (3–4 label pendek) — dipakai Pulse chart untuk
 * series multi-lapis. Cache + soft-fail via cachedSuggest.
 */
export async function deriveSubtopics(query: string): Promise<string[]> {
  const q = query.trim();
  if (q.length < MIN_CHARS) return [];
  return cachedSuggest(
    `subtopics:${normalizeKey(q)}`,
    `Sebutkan 4 subtopik atau aspek riset SPESIFIK dari topik "${q}". ` +
      "Aturan: 1–3 kata per baris (boleh istilah teknis Inggris), satu per baris, " +
      "TANPA nomor/bullet/tanda kutip.",
    4,
  );
}

export async function suggestQueries(partial: string): Promise<string[]> {
  const q = partial.trim();
  if (q.length < MIN_CHARS) return [];
  return cachedSuggest(
    `suggest:${normalizeKey(q)}`,
    "Kamu melengkapi kueri pencarian untuk aplikasi riset akademik. " +
      `Pengguna mengetik: "${q}". ` +
      `Berikan ${MAX_SUGGESTIONS} saran kueri pencarian riset yang utuh dan spesifik dalam Bahasa Indonesia, ` +
      "melanjutkan/menyempurnakan ketikan itu (topik, perdebatan, atau pertanyaan riset terkait). " +
      "Aturan: satu saran per baris, TANPA nomor/bullet/tanda kutip, maksimal 10 kata per baris.",
    MAX_SUGGESTIONS,
  );
}
