// Interest taxonomy — the single source of truth mapping onboarding interest
// field ids to the lowercase topic strings used as personalization signal.
//
// These topics mirror how papers/news are tagged (OpenAlex/arXiv domains) so the
// feed's lowercase-exact `interestMatch` (see feed.ts) picks them up directly.
// Onboarding seeds them into `userFeedInterests`; `searchPapers` recommendations
// reuse the per-user weighted slice (via `userInterestTopics`) as a provider
// query. Keep the values lowercase + English-aligned with the provider tags;
// provider-level Indonesian keyword expansion (for the Google News lane) is
// deferred until source-level personalization is enabled (see explore-revamp
// plan, Isu 3 — "MVP: drop personalisasi level-sumber").

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

// Canonical normalizer for any interest topic, on both the write (seed) and read
// (match) sides so diacritics/casing never cause a silent miss.
export function normalizeInterestTopic(topic: string): string {
  return topic.trim().toLowerCase();
}

export function isInterestFieldId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(INTEREST_FIELD_TOPICS, id);
}

// Flatten the picked interest field ids into a normalized, de-duplicated topic
// list ready to seed into `userFeedInterests`. Unknown ids are dropped.
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
