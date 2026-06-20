// Interest taxonomy — single source of truth memetakan id bidang minat onboarding
// ke string topic lowercase yang dipakai sebagai sinyal personalisasi feed (P4).
// Di-port verbatim dari V1 (packages/convex/convex/feed/interestKeywords.ts):
// nilai lowercase + English-aligned dengan tag provider (OpenAlex/arXiv).

export const INTEREST_FIELD_TOPICS: Record<string, string[]> = {
  ai_cs: ["artificial intelligence", "machine learning", "computer science"],
  kesehatan: ["medicine", "health"],
  biologi: ["biology", "genetics"],
  fisika: ["physics"],
  kimia: ["chemistry"],
  matematika: ["mathematics", "statistics"],
  teknik: ["engineering"],
  ekonomi: ["economics", "business"],
  psikologi: ["psychology"],
  sosial_politik: ["sociology", "political science"],
  pendidikan: ["education"],
  lingkungan: ["environmental science", "climate"],
  hukum: ["law"],
  neuroscience: ["neuroscience"],
  linguistik: ["linguistics"],
};

/** Normalizer kanonik (trim + lowercase) untuk sisi write (seed) & read (match). */
export function normalizeInterestTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function isInterestFieldId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTEREST_FIELD_TOPICS, id);
}

/**
 * Ratakan id bidang terpilih menjadi daftar topic ter-normalisasi & ter-dedup
 * siap di-seed ke user_feed_interests. Id tak dikenal di-drop.
 */
export function topicsForInterestFields(fieldIds: string[]): string[] {
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const id of fieldIds) {
    for (const raw of INTEREST_FIELD_TOPICS[id] ?? []) {
      const topic = normalizeInterestTopic(raw);
      if (!topic || seen.has(topic)) continue;
      seen.add(topic);
      topics.push(topic);
    }
  }
  return topics;
}
