// Per-subagent skill delegation (port of research/subagents/skillDelegation.ts
// + the deterministic trigger scorer). The writer subagent gets exactly one
// domain methodology pack; verification subagents map to fixed recipes.

export const DEEP_RESEARCH_DOMAIN_PACKS = [
  "research-medicine",
  "research-cs-ml",
  "research-education",
] as const;
export const DEEP_RESEARCH_FALLBACK_PACK = "research-general";

const DOMAIN_PACK_THRESHOLD = 0.12;

export type SkillCatalogEntry = {
  name: string;
  description: string;
  triggerKeywords?: string[];
};

export function scoringText(entry: SkillCatalogEntry): string {
  return [entry.description, ...(entry.triggerKeywords ?? [])].join(" ");
}

// Common ID + EN function words that carry no domain signal (port of
// evals/skillTriggerSurrogate.ts — kept identical so routing behavior matches
// the legacy runtime).
const STOPWORDS = new Set([
  // English
  "the", "and", "for", "with", "this", "that", "are", "was", "use", "used", "using",
  "when", "whether", "into", "from", "your", "you", "its", "any", "all", "can",
  "how", "what", "which", "they", "their", "have", "has", "not", "but", "out",
  "paper", "papers", "document", "text", "section", "please", "tolong",
  // Indonesian
  "dan", "atau", "saat", "yang", "untuk", "pada", "ini", "itu", "dari", "ke",
  "di", "dengan", "sebuah", "suatu", "akan", "bila", "agar", "alih", "satu",
  "dua", "tiga", "apakah", "adalah", "gunakan", "pakai", "buat", "lakukan",
  "kah", "nya", "dll", "dsb",
]);

function tokenize(text: string): string[] {
  return (text ?? "")
    .toLowerCase()
    // keep hyphen so "p-value" / "meta-analisis" survive.
    .replace(/[^a-z0-9\-À-ɏ]+/gi, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Relevance in [0,1]: the fraction of the prompt's distinctive content words
 * that also appear in the skill's scoring text. Asymmetric on purpose — a long
 * description must not dilute a short, on-topic prompt.
 */
export function skillTriggerScore(prompt: string, skillText: string): number {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return 0;
  const skillTokens = new Set(tokenize(skillText));
  if (skillTokens.size === 0) return 0;
  let hits = 0;
  const seen = new Set<string>();
  for (const token of promptTokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (skillTokens.has(token)) hits += 1;
  }
  return hits / seen.size;
}

// Pick the domain methodology pack whose description best matches the prompt,
// falling back to the general guide when nothing is clearly on-domain.
export function selectDomainPack(
  prompt: string,
  catalog: SkillCatalogEntry[],
): string | null {
  const byName = new Map(catalog.map((entry) => [entry.name, entry]));
  let best: { name: string; score: number } | null = null;
  for (const name of DEEP_RESEARCH_DOMAIN_PACKS) {
    const entry = byName.get(name);
    if (!entry) continue;
    const score = skillTriggerScore(prompt, scoringText(entry));
    if (!best || score > best.score) {
      best = { name, score };
    }
  }
  if (best && best.score >= DOMAIN_PACK_THRESHOLD) {
    return best.name;
  }
  if (byName.has(DEEP_RESEARCH_FALLBACK_PACK)) {
    return DEEP_RESEARCH_FALLBACK_PACK;
  }
  return best?.name ?? null;
}
