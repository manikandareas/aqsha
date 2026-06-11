// Deterministic keyword-overlap surrogate for skill triggering (Slice 3.3).
//
// In production the model picks `activate_skill` from the tier-1 catalog by
// reading each skill's description — an LLM decision that can't run cheaply in
// the gate. This pure surrogate scores how much a prompt's distinctive
// vocabulary overlaps a skill description, so the golden-set eval can assert that
// each shipped description FIRES on clearly on-domain prompts and stays SILENT on
// off-domain ones. It grades whether descriptions are discriminating — NOT the
// model's actual choice (that is the non-blocking Layer-B LLM eval).

// Common ID + EN function words that carry no domain signal. Kept deliberately
// small — domain terms (statcheck, sitasi, APA, p-value, riset) must survive.
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
    // keep hyphen so "p-value" / "chi-square" survive; collapse everything else.
    .replace(/[^a-z0-9\-À-ɏ]+/gi, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Relevance in [0,1]: the fraction of the prompt's distinctive content words that
 * also appear in the skill description. High when the prompt is "about" the
 * skill's domain. Symmetric matching is intentionally avoided — a long
 * description should not dilute a short, on-topic prompt.
 */
export function skillTriggerScore(prompt: string, skillDescription: string): number {
  const promptTokens = tokenize(prompt);
  if (promptTokens.length === 0) return 0;
  const descTokens = new Set(tokenize(skillDescription));
  if (descTokens.size === 0) return 0;
  let hits = 0;
  const seen = new Set<string>();
  for (const t of promptTokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    if (descTokens.has(t)) hits += 1;
  }
  return hits / seen.size;
}

/** Default firing threshold — tuned against the skill-trigger golden matrix. */
export const SKILL_TRIGGER_THRESHOLD = 0.25;

export function skillWouldTrigger(
  prompt: string,
  skillDescription: string,
  threshold: number = SKILL_TRIGGER_THRESHOLD,
): boolean {
  return skillTriggerScore(prompt, skillDescription) >= threshold;
}
