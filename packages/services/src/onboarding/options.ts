// Canonical option sets onboarding — kontrak dengan frontend (label hidup di
// frontend; backend hanya validasi id). Di-port verbatim dari V1
// (packages/convex/convex/onboarding.ts).

export const BACKGROUND_IDS = [
  "pelajar",
  "mahasiswa_s1",
  "mahasiswa_s2",
  "mahasiswa_s3",
  "peneliti",
  "dosen",
  "profesional",
  "lainnya",
] as const;

export const SOURCE_IDS = [
  "teman",
  "instagram",
  "tiktok",
  "x",
  "youtube",
  "google",
  "linkedin",
  "kampus",
  "lainnya",
] as const;

export const MIN_INTERESTS = 3;
export const SEED_INTEREST_WEIGHT = 2;

/** Sentinel sumber "lainnya" yang mewajibkan free-text heardAboutOther. */
export const SOURCE_OTHER_ID = "lainnya";

const backgroundSet = new Set<string>(BACKGROUND_IDS);
const sourceSet = new Set<string>(SOURCE_IDS);

export function isBackgroundId(id: string): boolean {
  return backgroundSet.has(id);
}

export function isSourceId(id: string): boolean {
  return sourceSet.has(id);
}
