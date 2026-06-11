import { skillTriggerScore } from "../../evals/skillTriggerSurrogate";

// Per-subagent skill delegation (Slice R4). Instead of stuffing the whole skill
// catalog into one deep-research context, each v2 subagent resolves only the pack
// it needs: the writer picks the best-matching domain research methodology, the
// citation/statistical steps map to their fixed verification recipes. Pure
// selection so it is unit-testable; the actual body load + activation recording
// happens in the subagent (it needs ctx).

// Domain methodology packs the writer chooses between, with a general fallback.
export const DEEP_RESEARCH_DOMAIN_PACKS = [
  "deep-research-medis",
  "deep-research-cs-ml",
  "deep-research-pendidikan",
] as const;
export const DEEP_RESEARCH_FALLBACK_PACK = "deep-research-guide";

// Minimum description-overlap score to prefer a specialized pack over the general
// guide. Below this, the prompt is not clearly on-domain → use the fallback.
const DOMAIN_PACK_THRESHOLD = 0.12;

export type SkillCatalogEntry = { name: string; description: string };

// Pick the domain methodology pack whose description best matches the prompt,
// falling back to the general deep-research guide when nothing is clearly
// on-domain. Returns null only when neither the matched pack nor the fallback is
// present in the catalog.
export function selectDomainPack(
  prompt: string,
  catalog: SkillCatalogEntry[],
): string | null {
  const byName = new Map(catalog.map((s) => [s.name, s]));
  let best: { name: string; score: number } | null = null;
  for (const name of DEEP_RESEARCH_DOMAIN_PACKS) {
    const entry = byName.get(name);
    if (!entry) continue;
    const score = skillTriggerScore(prompt, entry.description);
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
