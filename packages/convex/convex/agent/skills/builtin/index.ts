// Builtin Agent Skills entry point. The real source of truth is the SKILL.md
// folder layout under packages/convex/skills/<name>/ (agentskills.io standard,
// portable to Claude Code / Codex / Gemini CLI). Those files are bundled into
// ./generated.ts by scripts/bundle-skills.mjs (Convex functions cannot read the
// filesystem at runtime), and re-exported here so the seed path imports a stable
// module path.
//
// To add or edit a builtin skill: change the SKILL.md file(s), run
// `bun run --filter '@aqsha/convex' skills:bundle`, then re-seed with
// `npx convex run agent/skills/skills:seedBuiltinSkills`.
export {
  BUILTIN_SKILLS,
  BUILTIN_SKILL_DOCS,
  type BuiltinSkill,
  type BuiltinSkillResource,
} from "./generated";
