import { describe, expect, it } from "vitest";
import {
  DEEP_RESEARCH_FALLBACK_PACK,
  selectDomainPack,
} from "../convex/agent/research/subagents/skillDelegation";

// Slice R4: the writer resolves only its own domain methodology pack. The selector
// picks the best-matching deep-research-* pack by description overlap and falls back
// to the general guide when nothing is clearly on-domain.

const catalog = [
  {
    name: "deep-research-medis",
    description:
      "Metodologi deep research bidang kedokteran/kesehatan: skrining PRISMA, hierarki bukti meta-analisis RCT kohort, retraction dan jurnal predator. Untuk pertanyaan riset klinis biomedis.",
  },
  {
    name: "deep-research-cs-ml",
    description:
      "Metodologi deep research bidang computer science machine learning: benchmark dan SOTA, ablation reproducibility, preprint, leaderboard. Untuk pertanyaan riset CS ML.",
  },
  {
    name: "deep-research-pendidikan",
    description:
      "Metodologi deep research bidang pendidikan: hierarki desain studi, effect size dan ukuran sampel, batas transfer konteks pembelajaran. Untuk pertanyaan riset pendidikan.",
  },
  {
    name: "deep-research-guide",
    description: "Metodologi umum deep research berbasis sumber lintas bidang.",
  },
  { name: "citation-apa7", description: "Konvensi sitasi APA 7." },
];

describe("selectDomainPack", () => {
  it("picks the medical pack for a clinical-evidence prompt", () => {
    const pack = selectDomainPack(
      "Apakah RCT meta-analisis mendukung efikasi intervensi klinis untuk pasien kohort?",
      catalog,
    );
    expect(pack).toBe("deep-research-medis");
  });

  it("picks the CS/ML pack for a benchmark/ablation prompt", () => {
    const pack = selectDomainPack(
      "Bandingkan benchmark SOTA dan ablation reproducibility model machine learning di leaderboard",
      catalog,
    );
    expect(pack).toBe("deep-research-cs-ml");
  });

  it("falls back to the general guide for an off-domain prompt", () => {
    const pack = selectDomainPack("Sejarah singkat kopi nusantara", catalog);
    expect(pack).toBe(DEEP_RESEARCH_FALLBACK_PACK);
  });

  it("returns null when neither a matched pack nor the fallback is present", () => {
    expect(selectDomainPack("apa pun", [{ name: "citation-apa7", description: "x" }])).toBeNull();
  });
});
