/**
 * Skills Astra (Fase 1) — 11 `SKILL.md` metodologi diport apa adanya dari eve
 * `agent/skills/`. Mastra menyediakan tool bawaan (`skill`/`skill_read`/`skill_search`,
 * progressive disclosure) saat `skills` terdaftar — TANPA sandbox (mematikan bug `load_skill`
 * eve). Path di-resolve relatif `process.cwd()` (`resolve(cwd, path)`); `mastra dev` + Docker
 * WORKDIR = `apps/agent`, jadi `src/mastra/skills/<name>` valid di kedua lingkungan.
 */
const SKILL_NAMES = [
  "cite-apa7",
  "deep-research",
  "meta-analysis-synthesis",
  "replication-readiness",
  "research-cs-ml",
  "research-education",
  "research-general",
  "research-medicine",
  "verify-citations",
  "verify-statistics",
  "write-academic-id",
] as const;

export const skillPaths: string[] = SKILL_NAMES.map((name) => `src/mastra/skills/${name}`);
