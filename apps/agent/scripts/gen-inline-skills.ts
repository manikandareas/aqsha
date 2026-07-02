/**
 * Codegen skill INLINE — baca tiap `src/mastra/skills/<name>/SKILL.md` lalu tulis
 * `src/mastra/skills-inline.ts` (array `createSkill(...)`).
 *
 * KENAPA inline: `mastra build` mem-bundle ke `.mastra/output` TANPA menyalin folder skills, dan
 * runtime cwd = `<mastraDir>/public` (BUKAN `apps/agent`) → path skill relatif (`src/mastra/skills/x`)
 * tak ke-resolve → "Skill not found / Available skills: (kosong)". Inline mengompilasi isi SKILL.md
 * ke bundle → lepas dari cwd/fs (jalan di dev & prod). SKILL.md tetap SUMBER KEBENARAN; jalankan
 * `bun run skills:gen` setelah mengubahnya.
 *
 * Catatan: skill saat ini single-file (hanya SKILL.md, tanpa folder references) — generator
 * menolak bila menemukan file lain agar referensi tak diam-diam hilang.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const skillsDir = join(here, "..", "src", "mastra", "skills");
const outFile = join(here, "..", "src", "mastra", "skills-inline.ts");

type Parsed = { name: string; description: string; instructions: string };

/** Pisah frontmatter `---\nkey: value\n---` + body. Frontmatter = `key: value` per baris. */
function parseSkill(md: string, dir: string): Parsed {
  const m = md.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) throw new Error(`SKILL.md ${dir}: frontmatter \`---\` tak ditemukan`);
  const front = m[1]!;
  const body = m[2]!.trim();
  const get = (key: string): string => {
    const line = front.split("\n").find((l) => l.startsWith(`${key}:`));
    if (!line) throw new Error(`SKILL.md ${dir}: frontmatter \`${key}\` hilang`);
    const raw = line.slice(key.length + 1).trim();
    // Lepas kutip pembungkus (sebagian SKILL.md menulis `description: "..."`).
    return raw.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  };
  const name = get("name");
  const description = get("description");
  if (!name || !description || !body) throw new Error(`SKILL.md ${dir}: name/description/body kosong`);
  return { name, description, instructions: body };
}

const names = readdirSync(skillsDir)
  .filter((n) => statSync(join(skillsDir, n)).isDirectory())
  .sort();

const skills: Parsed[] = [];
for (const name of names) {
  const dir = join(skillsDir, name);
  const entries = readdirSync(dir);
  if (entries.length !== 1 || entries[0] !== "SKILL.md") {
    throw new Error(`Skill ${name} punya file selain SKILL.md (${entries.join(", ")}); generator inline belum dukung references.`);
  }
  skills.push(parseSkill(readFileSync(join(dir, "SKILL.md"), "utf8"), name));
}

const body = skills
  .map(
    (s) =>
      `  createSkill({\n    name: ${JSON.stringify(s.name)},\n    description: ${JSON.stringify(s.description)},\n    instructions: ${JSON.stringify(s.instructions)},\n  }),`,
  )
  .join("\n");

const out = `// AUTO-GENERATED oleh scripts/gen-inline-skills.ts — JANGAN edit manual.
// Sumber kebenaran = src/mastra/skills/<name>/SKILL.md; regen: \`bun run skills:gen\`.
import { createSkill } from "@mastra/core/skills";

/**
 * Skill metodologi Astra (${skills.length}) sebagai INLINE skill — di-compile ke bundle (lepas dari
 * cwd/fs, beda dari path filesystem yang gagal resolve saat runtime cwd = <mastraDir>/public).
 */
export const inlineSkills = [
${body}
];
`;

writeFileSync(outFile, out);
console.log(`[skills:gen] wrote ${skills.length} inline skills → ${outFile}`);
