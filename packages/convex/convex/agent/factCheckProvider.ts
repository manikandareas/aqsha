import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { rateLimiter } from "../limits";
import type { FeedVerdict, FeedVerdictSeverity } from "../feedModel";

// Google Fact Check Tools API — ClaimReview aggregator. We use it as the
// human-verdict source for the Feed fact-check lane (Indonesia-first via
// `languageCode=id`, which surfaces Mafindo / Cek Fakta / Tempo / Liputan6
// reviews). We NEVER auto-label; every verdict here originates from a
// professional fact-checker's `textualRating`.
//
// Docs: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
const FACTCHECK_ENDPOINT =
  "https://factchecktools.googleapis.com/v1alpha1/claims:search";

export type FactCheckClaim = {
  text: string;
  claimant?: string;
  claimDate?: string;
  verdict: FeedVerdict;
  severity: FeedVerdictSeverity;
  verdictLabelRaw: string;
  publisher?: string;
  publisherSite?: string;
  reviewUrl?: string;
  reviewedAt?: number;
  reviewTitle?: string;
  languageCode?: string;
};

type GoogleClaimReview = {
  publisher?: { name?: string | null; site?: string | null } | null;
  url?: string | null;
  title?: string | null;
  reviewDate?: string | null;
  textualRating?: string | null;
  languageCode?: string | null;
};

type GoogleClaim = {
  text?: string | null;
  claimant?: string | null;
  claimDate?: string | null;
  claimReview?: GoogleClaimReview[] | null;
};

// Science + health gate. The lane is intentionally scoped to claims where
// academic evidence is the right adjudicator (per PRD §3 "sains + kesehatan
// saja") — we drop politics/scam/celebrity claims.
const SCIENCE_HEALTH_TERMS = [
  "kesehatan",
  "sehat",
  "vaksin",
  "obat",
  "penyakit",
  "virus",
  "bakteri",
  "kanker",
  "diabetes",
  "jantung",
  "covid",
  "gizi",
  "nutrisi",
  "makanan",
  "minuman",
  "diet",
  "stunting",
  "iklim",
  "cuaca",
  "lingkungan",
  "gempa",
  "radiasi",
  "kimia",
  "sains",
  "ilmiah",
  "peneliti",
  "studi",
  "penelitian",
  "tubuh",
  "darah",
  "otak",
  "hamil",
  "bayi",
  "anak",
  "rokok",
  "alkohol",
  "gula",
  "garam",
  "kolesterol",
  "imun",
  "antibiotik",
  "hormon",
  "energi",
  "nuklir",
  "5g",
  "microchip",
  "klorokuin",
];

// Seed queries used to harvest science/health ClaimReviews. The provider
// rotates through these so a single daily run covers the main debunk topics
// that recur in Indonesia (health, vaccines, food, climate, disaster).
export const FACTCHECK_SEED_QUERIES = [
  "kesehatan",
  "vaksin",
  "obat",
  "makanan",
  "penyakit",
  "iklim",
  "gizi",
  "covid",
];

export function isScienceHealthClaim(text: string): boolean {
  const haystack = text.toLowerCase();
  return SCIENCE_HEALTH_TERMS.some((term) => haystack.includes(term));
}

// Matched terms → a few human-friendly topic labels for the claim card / feed
// interest model. Order of checks determines priority.
const TOPIC_RULES: Array<{ label: string; needles: string[] }> = [
  { label: "COVID-19", needles: ["covid", "corona"] },
  { label: "Vaksin", needles: ["vaksin"] },
  { label: "Gizi & Pangan", needles: ["gizi", "nutrisi", "makanan", "minuman", "diet", "gula", "garam", "kolesterol", "stunting"] },
  { label: "Obat & Penyakit", needles: ["obat", "penyakit", "kanker", "diabetes", "jantung", "antibiotik", "klorokuin", "imun", "hormon"] },
  { label: "Iklim & Lingkungan", needles: ["iklim", "cuaca", "lingkungan", "gempa", "energi", "nuklir"] },
  { label: "Teknologi & Radiasi", needles: ["5g", "microchip", "radiasi", "kimia"] },
  { label: "Kesehatan", needles: ["kesehatan", "sehat", "tubuh", "darah", "otak", "hamil", "bayi", "anak", "rokok", "alkohol", "virus", "bakteri"] },
  { label: "Sains", needles: ["sains", "ilmiah", "peneliti", "studi", "penelitian"] },
];

export function deriveClaimTopics(text: string): string[] {
  const haystack = text.toLowerCase();
  const labels: string[] = [];
  for (const rule of TOPIC_RULES) {
    if (rule.needles.some((n) => haystack.includes(n))) {
      labels.push(rule.label);
    }
    if (labels.length >= 3) break;
  }
  return labels.length > 0 ? labels : ["Sains"];
}

// textualRating (free-form, publisher-authored) → graduated taxonomy.
// Unknown ratings fall back to `unverified` (never silently "false").
export function mapTextualRatingToVerdict(rating: string | null | undefined): {
  verdict: FeedVerdict;
  severity: FeedVerdictSeverity;
} {
  const r = (rating ?? "").toLowerCase().trim();
  if (!r) {
    return { verdict: "unverified", severity: "info" };
  }

  const has = (...needles: string[]) => needles.some((n) => r.includes(n));

  // Order matters: check "sebagian"/"partly" before bare "benar"/"salah".
  if (
    has(
      "sebagian benar",
      "sebagian salah",
      "setengah benar",
      "partly true",
      "partly false",
      "half true",
      "campuran",
      "mixture",
      "mixed",
    )
  ) {
    return { verdict: "partially_supported", severity: "warning" };
  }
  if (
    has(
      "menyesatkan",
      "misleading",
      "lacks context",
      "missing context",
      "kurang konteks",
      "perlu konteks",
      "butuh konteks",
      "tanpa konteks",
      "konteks keliru",
      "clickbait",
      "belum ada bukti",
      "tidak ada bukti",
      "prematur",
      "outdated",
      "kedaluwarsa",
      "unproven",
    )
  ) {
    return { verdict: "needs_context", severity: "warning" };
  }
  if (
    has(
      "hoaks",
      "hoax",
      "salah",
      "false",
      "keliru",
      "tidak benar",
      "tdk benar",
      "disinformasi",
      "misinformasi",
      "fabricat",
      "fitnah",
      "palsu",
      "tipuan",
      "menipu",
      "bohong",
      "scam",
      "penipuan",
      "fake",
      "debunk",
      "pants on fire",
    )
  ) {
    return { verdict: "contradicted", severity: "high" };
  }
  if (
    has(
      "benar",
      "fakta",
      "terbukti",
      "true",
      "fact",
      "valid",
      "sahih",
      "akurat",
      "correct",
      "verified",
    )
  ) {
    return { verdict: "supported", severity: "info" };
  }
  return { verdict: "unverified", severity: "info" };
}

function parseDateMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function normalizeClaim(claim: GoogleClaim): FactCheckClaim | null {
  const text = (claim.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const reviews = claim.claimReview ?? [];
  // Prefer an Indonesian-language review, else the first available.
  const review =
    reviews.find((r) => (r.languageCode ?? "").toLowerCase().startsWith("id")) ??
    reviews[0];
  if (!review) return null;

  const { verdict, severity } = mapTextualRatingToVerdict(review.textualRating);
  return {
    text,
    claimant: claim.claimant ?? undefined,
    claimDate: claim.claimDate ?? undefined,
    verdict,
    severity,
    verdictLabelRaw: (review.textualRating ?? "").trim() || "Tidak ada rating",
    publisher: review.publisher?.name ?? undefined,
    publisherSite: review.publisher?.site ?? undefined,
    reviewUrl: review.url ?? undefined,
    reviewedAt: parseDateMs(review.reviewDate),
    reviewTitle: review.title ?? undefined,
    languageCode: review.languageCode ?? undefined,
  };
}

// Service-path search: no authenticated user, so we skip per-user credits and
// only honour the global rate bucket + 24h provider cache.
export async function searchFactCheckClaims(
  ctx: ActionCtx,
  args: {
    query: string;
    languageCode?: string;
    maxAgeDays?: number;
    pageSize?: number;
  },
): Promise<FactCheckClaim[]> {
  const query = args.query.trim();
  const languageCode = args.languageCode ?? "id";
  const maxAgeDays = args.maxAgeDays ?? 30;
  const pageSize = Math.min(args.pageSize ?? 20, 50);

  const cacheKey = `factcheck:${languageCode}:${maxAgeDays}:${pageSize}:${query}`;
  const cached: { valueJson: string } | null = await ctx.runQuery(
    internal.agent.externalProviders.getCache,
    { provider: "google_factcheck", cacheKey },
  );
  if (cached) {
    try {
      return JSON.parse(cached.valueJson) as FactCheckClaim[];
    } catch {
      // fall through to refetch
    }
  }

  const apiKey = process.env.GOOGLE_FACTCHECK_API_KEY;
  if (!apiKey) {
    // Not configured — degrade gracefully (the lane simply stays empty).
    return [];
  }

  const status = await rateLimiter.check(ctx, "googleFactCheckGlobal");
  if (!status.ok) {
    return [];
  }
  await rateLimiter.limit(ctx, "googleFactCheckGlobal");

  const url = new URL(FACTCHECK_ENDPOINT);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("languageCode", languageCode);
  url.searchParams.set("maxAgeDays", String(maxAgeDays));
  url.searchParams.set("pageSize", String(pageSize));
  if (query) {
    url.searchParams.set("query", query);
  }

  let claims: FactCheckClaim[] = [];
  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      await ctx.runMutation(internal.agent.externalProviders.putCache, {
        provider: "google_factcheck",
        cacheKey,
        status: "failed",
        valueJson: "[]",
        failureReason: `Google Fact Check returned ${response.status}`,
      });
      return [];
    }
    const json = (await response.json()) as { claims?: GoogleClaim[] };
    claims = (json.claims ?? [])
      .map(normalizeClaim)
      .filter((c): c is FactCheckClaim => Boolean(c))
      .filter((c) => isScienceHealthClaim(c.text));
  } catch (error) {
    await ctx.runMutation(internal.agent.externalProviders.putCache, {
      provider: "google_factcheck",
      cacheKey,
      status: "failed",
      valueJson: "[]",
      failureReason: error instanceof Error ? error.message : "fetch failed",
    });
    return [];
  }

  await ctx.runMutation(internal.agent.externalProviders.putCache, {
    provider: "google_factcheck",
    cacheKey,
    status: claims.length > 0 ? "ready" : "empty",
    valueJson: JSON.stringify(claims),
  });

  return claims;
}
