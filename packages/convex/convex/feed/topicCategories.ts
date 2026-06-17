// Topic categories for the discovery "Topics" nav (Isu 6). Science/health-adapted
// to match Aqsha's actual feed + INTEREST_FIELDS (owner decision over the generic
// general-news set) so every category has real content instead of empty tabs.
//
// MVP is keyword-based: a feed item belongs to a category when its topics[]/title
// overlaps the category's keyword set (lowercase substring). Formalize later via
// an LLM-classified `feedItems.topicCategory` field set at ingest.

export const DISCOVERY_TOPIC_CATEGORIES = [
  "sains_teknologi",
  "kesehatan",
  "lingkungan",
  "sosial_ekonomi",
  "pendidikan",
] as const;
export type DiscoveryTopicCategory = (typeof DISCOVERY_TOPIC_CATEGORIES)[number];

export const DISCOVERY_TOPIC_CATEGORY_LABELS: Record<
  DiscoveryTopicCategory,
  string
> = {
  sains_teknologi: "Sains & Teknologi",
  kesehatan: "Kesehatan",
  lingkungan: "Lingkungan",
  sosial_ekonomi: "Sosial & Ekonomi",
  pendidikan: "Pendidikan",
};

// Keyword sets (ID + EN). Kept reasonably specific — short/ambiguous tokens that
// substring-match unrelated words are avoided.
const CATEGORY_KEYWORDS: Record<DiscoveryTopicCategory, string[]> = {
  sains_teknologi: [
    "sains", "science", "teknologi", "technology", "fisika", "physics",
    "kimia", "chemistry", "matematika", "mathematics", "statistic",
    "artificial intelligence", "machine learning", "computer science",
    "engineering", "teknik", "astronom", "biolog", "biology", "genetic",
    "neuroscience", "material", "robot", "kuantum", "quantum", "algoritma",
  ],
  kesehatan: [
    "kesehatan", "health", "medicine", "medis", "medical", "penyakit",
    "disease", "vaksin", "vaccine", "gizi", "nutrition", "mental",
    "clinical", "klinis", "obat", "drug", "epidemi", "pandemi", "pandemic",
    "kanker", "cancer", "kedokteran", "imun", "immun", "stunting",
  ],
  lingkungan: [
    "lingkungan", "environment", "iklim", "climate", "energi", "energy",
    "terbarukan", "renewable", "emisi", "emission", "biodiversit",
    "keanekaragaman hayati", "konservasi", "conservation", "polusi",
    "pollution", "bencana", "ecology", "ekologi", "karbon", "carbon",
  ],
  sosial_ekonomi: [
    "ekonomi", "economic", "economy", "bisnis", "business", "sosial",
    "social", "sociolog", "politik", "political", "kebijakan", "policy",
    "keuangan", "finance", "pasar", "market", "pembangunan", "development",
    "masyarakat", "demografi", "hukum", "law", "perdagangan", "investasi",
  ],
  pendidikan: [
    "pendidikan", "education", "pembelajaran", "learning", "sekolah",
    "school", "kampus", "universitas", "university", "literasi", "literacy",
    "kurikulum", "curriculum", "asesmen", "assessment", "pedagog",
    "linguistic", "linguistik", "mahasiswa", "pengajaran",
  ],
};

export function isDiscoveryTopicCategory(
  value: string,
): value is DiscoveryTopicCategory {
  return (DISCOVERY_TOPIC_CATEGORIES as readonly string[]).includes(value);
}

// Does a feed item (its topics + title) fall in the given category?
export function matchesTopicCategory(
  category: DiscoveryTopicCategory,
  topics: string[],
  title: string,
): boolean {
  const haystack = `${topics.join(" ")} ${title}`.toLowerCase();
  return CATEGORY_KEYWORDS[category].some((kw) => haystack.includes(kw));
}
