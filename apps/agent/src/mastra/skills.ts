/**
 * Skills Astra — 11 `SKILL.md` metodologi sebagai **INLINE skill** (`createSkill`), di-compile ke
 * bundle via codegen (`scripts/gen-inline-skills.ts`, re-run di `dev`/`build`/`typecheck`).
 *
 * KENAPA inline (bukan path filesystem): `mastra build` mem-bundle ke `.mastra/output` TANPA menyalin
 * folder `skills/`, dan runtime cwd = `<mastraDir>/public` (BUKAN `apps/agent`) → path relatif
 * `src/mastra/skills/<name>` tak ke-resolve → tool `skill` balas "Available skills: (kosong)".
 * Inline melepas skill dari cwd/fs sehingga jalan sama di `mastra dev` maupun Docker prod.
 * SKILL.md tetap SUMBER KEBENARAN; ubah file lalu `bun run skills:gen` (otomatis di dev/build).
 *
 * Mastra menyediakan tool bawaan (`skill`/`skill_read`/`skill_search`, progressive disclosure)
 * saat `skills` terdaftar — TANPA sandbox.
 */
import { inlineSkills } from "./skills-inline";

export { inlineSkills };

/**
 * Isi (body SKILL.md) satu inline skill by name — untuk langkah yang berjalan `toolChoice:"none"`
 * (mis. `synthesize` di Workflow `/deep`) sehingga tak bisa memuat skill lewat tool: panduannya
 * DI-INLINE ke prompt (CFG-2). Tetap SSOT: konten datang dari codegen SKILL.md, bukan salinan.
 * Throw bila nama tak dikenal — salah ketik harus gagal keras saat dev, bukan senyap.
 */
export function inlineSkillInstructions(name: string): string {
  const skill = inlineSkills.find((s) => s.name === name);
  if (!skill) throw new Error(`Inline skill tidak ditemukan: ${name}`);
  return skill.instructions;
}
