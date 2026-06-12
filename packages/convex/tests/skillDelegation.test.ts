import { describe, expect, it } from "vitest";
import {
  DEEP_RESEARCH_FALLBACK_PACK,
  selectDomainPack,
} from "../convex/agent/research/subagents/skillDelegation";

// Slice R4: the writer resolves only its own domain methodology pack. The selector
// picks the best-matching research-* pack by description+triggerKeywords overlap and
// falls back to the general guide when nothing is clearly on-domain. Descriptions are
// English; the Indonesian routing terms ride in triggerKeywords (mirrors production).

const catalog = [
  {
    name: "research-medicine",
    description:
      "Deep-research methodology for medicine and health: PRISMA screening, evidence hierarchy, retraction and predatory-journal flagging.",
    triggerKeywords: [
      "kedokteran", "klinis", "biomedis", "prisma", "hierarki", "bukti",
      "rct", "kohort", "meta-analisis", "retraction", "jurnal", "predator",
    ],
  },
  {
    name: "research-cs-ml",
    description:
      "Deep-research methodology for computer science / machine learning: benchmark and SOTA discipline, ablation and reproducibility, preprint weighting, leaderboard caution.",
    triggerKeywords: [
      "benchmark", "sota", "ablation", "reproducibility", "preprint",
      "leaderboard", "machine", "learning", "computer", "model",
    ],
  },
  {
    name: "research-education",
    description:
      "Deep-research methodology for education: study-design hierarchy, effect-size and sample-size caution, context-transfer limits.",
    triggerKeywords: [
      "pendidikan", "pembelajaran", "desain", "studi", "effect", "size",
      "ukuran", "sampel", "transfer", "konteks", "kurikulum",
    ],
  },
  {
    name: "research-general",
    description: "General source-based deep-research methodology across domains.",
    triggerKeywords: ["deep", "research", "riset", "metodologi", "sintesis", "sumber"],
  },
  { name: "cite-apa7", description: "APA 7th citation conventions." },
];

describe("selectDomainPack", () => {
  it("picks the medical pack for a clinical-evidence prompt", () => {
    const pack = selectDomainPack(
      "Apakah RCT meta-analisis mendukung efikasi intervensi klinis untuk pasien kohort?",
      catalog,
    );
    expect(pack).toBe("research-medicine");
  });

  it("picks the CS/ML pack for a benchmark/ablation prompt", () => {
    const pack = selectDomainPack(
      "Bandingkan benchmark SOTA dan ablation reproducibility model machine learning di leaderboard",
      catalog,
    );
    expect(pack).toBe("research-cs-ml");
  });

  it("falls back to the general guide for an off-domain prompt", () => {
    const pack = selectDomainPack("Sejarah singkat kopi nusantara", catalog);
    expect(pack).toBe(DEEP_RESEARCH_FALLBACK_PACK);
  });

  it("returns null when neither a matched pack nor the fallback is present", () => {
    expect(selectDomainPack("apa pun", [{ name: "cite-apa7", description: "x" }])).toBeNull();
  });
});
