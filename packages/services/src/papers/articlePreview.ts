/**
 * Best-effort article preview extraction (P4 feed enrichment). Port verbatim V1
 * `papers/articlePreview.ts` — fetch + pure extraction terpisah supaya lane news/fact
 * share satu boundary + bisa di-test tanpa network. Hanya bergantung http.ts.
 */
import { fetchWithTimeout, userAgent } from "./http";

const FETCH_TIMEOUT_MS = 7_000;
const MAX_HTML_CHARS = 400_000;
const ARTICLE_MAX_CHARS = 12_000;
const MIN_PARAGRAPH_CHARS = 35;
const MIN_ARTICLE_CHARS = 200;

const BOILERPLATE_PREFIXES = [
  "baca juga", "baca:", "baca selengkapnya", "simak breaking news", "pilihan editor",
  "ikuti kami", "ikuti berita", "bagikan", "advertisement", "scroll to continue",
  "scroll untuk", "scroll ke bawah", "video pilihan", "tonton juga", "copyright",
  "all rights reserved", "hak cipta", "berita terkait", "topik terkait", "lihat juga",
  "baca berita tanpa iklan", "gabung kompas", "program lestari",
];

const META_IMAGE_PATTERNS: RegExp[] = [
  /<meta[^>]+(?:property|name)=["']og:image:secure_url["'][^>]*\scontent=["']([^"']+)["']/i,
  /<meta[^>]+(?:property|name)=["']og:image["'][^>]*\scontent=["']([^"']+)["']/i,
  /<meta[^>]+(?:property|name)=["']twitter:image(?::src)?["'][^>]*\scontent=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*\s(?:property|name)=["']og:image["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*\s(?:property|name)=["']twitter:image(?::src)?["']/i,
];

export type ArticlePreview = {
  imageUrl?: string;
  articleText?: string;
};

export async function fetchArticlePreview(pageUrl: string): Promise<ArticlePreview> {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return {};
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") return {};
  if (base.hostname === "toolbox.google.com") return {};

  try {
    const response = await fetchWithTimeout(pageUrl, {
      timeoutMs: FETCH_TIMEOUT_MS,
      redirect: "follow",
      headers: {
        "User-Agent": userAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) return {};
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html") && !contentType.includes("xml")) return {};
    const html = (await response.text()).slice(0, MAX_HTML_CHARS);
    return extractArticlePreviewFromHtml(html, base);
  } catch {
    return {};
  }
}

export function extractArticlePreviewFromHtml(html: string, baseUrl: URL | string): ArticlePreview {
  const base = typeof baseUrl === "string" ? new URL(baseUrl) : baseUrl;
  return {
    imageUrl: resolveImage(html, base),
    articleText: extractArticleTextFromHtml(html),
  };
}

function resolveImage(html: string, base: URL): string | undefined {
  const raw = extractMetaImage(html) ?? extractJsonLdImage(html);
  if (!raw) return undefined;
  try {
    const resolved = new URL(normalizeUrl(raw), base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") return undefined;
    return resolved.toString();
  } catch {
    return undefined;
  }
}

function extractMetaImage(html: string): string | undefined {
  const headEnd = html.search(/<\/head>/i);
  const scope = headEnd > 0 ? html.slice(0, headEnd) : html;
  for (const pattern of META_IMAGE_PATTERNS) {
    const value = scope.match(pattern)?.[1]?.trim();
    if (value) return value;
  }
  return undefined;
}

function extractJsonLdImage(html: string): string | undefined {
  const blocks = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const json = block[1] ?? "";
    const value =
      json.match(/"image"\s*:\s*"([^"]+)"/i)?.[1] ??
      json.match(/"image"\s*:\s*\[\s*"([^"]+)"/i)?.[1] ??
      json.match(/"image"\s*:\s*\{[^}]*?"url"\s*:\s*"([^"]+)"/i)?.[1];
    const cleaned = value?.trim();
    if (cleaned && /^https?:/i.test(normalizeUrl(cleaned))) return cleaned;
  }
  return undefined;
}

export function extractArticleTextFromHtml(html: string): string | undefined {
  const scope = pickArticleScope(html);
  const cleaned = scope
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<(nav|header|footer|aside|form|figure|figcaption)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const blocks: string[] = [];
  const paragraphRe = /<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = paragraphRe.exec(cleaned)) !== null) {
    const text = stripTags(match[2] ?? "");
    if (!isContentParagraph(text)) continue;
    if (blocks[blocks.length - 1] !== text) blocks.push(text);
  }

  const joined = blocks.join("\n\n").trim();
  if (joined.length < MIN_ARTICLE_CHARS) return undefined;
  return joined.slice(0, ARTICLE_MAX_CHARS);
}

export function cleanPlainText(text: string): string | undefined {
  const kept: string[] = [];
  for (const rawLine of text.split(/\n+/)) {
    const line = rawLine.trim().replace(/^#{1,6}\s*/, "").replace(/^[-*+]\s+/, "").trim();
    if (!isContentParagraph(line)) continue;
    if (kept[kept.length - 1] !== line) kept.push(line);
  }
  const joined = kept.join("\n\n").trim();
  if (joined.length < MIN_ARTICLE_CHARS) return undefined;
  return joined.slice(0, ARTICLE_MAX_CHARS);
}

function pickArticleScope(html: string): string {
  const article = largestBlock(html, "article");
  if (article && countParagraphs(article) >= 2) return article;
  const main = largestBlock(html, "main");
  if (main && countParagraphs(main) >= 2) return main;
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
  return body ?? html;
}

function largestBlock(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi");
  let best: string | undefined;
  let bestCount = 0;
  for (const m of html.matchAll(re)) {
    const count = countParagraphs(m[1] ?? "");
    if (count > bestCount) {
      bestCount = count;
      best = m[1];
    }
  }
  return best;
}

function countParagraphs(html: string): number {
  return (html.match(/<p\b/gi) ?? []).length;
}

function isContentParagraph(text: string): boolean {
  if (text.length < MIN_PARAGRAPH_CHARS) return false;
  const lower = text.toLowerCase();
  if (lower.includes("baca juga")) return false;
  if (BOILERPLATE_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  if (!/[.!?](\s|$|["'”’])/.test(text)) return false;
  const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) ?? []).length;
  return letters >= text.length * 0.5;
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(value: string): string {
  return decodeEntities(value).replace(/\\\//g, "/").trim();
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&(?:hellip|#8230);/gi, "…")
    .replace(/&(?:mdash|#8212);/gi, "—")
    .replace(/&(?:ndash|#8211);/gi, "–")
    .replace(/&(?:ldquo|#8220);/gi, "“")
    .replace(/&(?:rdquo|#8221);/gi, "”")
    .replace(/&(?:lsquo|#8216);/gi, "‘")
    .replace(/&(?:rsquo|#8217);/gi, "’")
    .replace(/&#x2f;/gi, "/")
    .replace(/&#47;/g, "/")
    .replace(/&#(\d+);/g, (_, dec) => safeFromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeFromCodePoint(parseInt(hex, 16)));
}

function safeFromCodePoint(code: number): string {
  try {
    return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : "";
  } catch {
    return "";
  }
}
