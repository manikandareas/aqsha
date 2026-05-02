import type { SkillMetadata } from "./types";

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) {
    return "Available skills: none.";
  }

  const skillList = skills
    .map((skill) => `- ${skill.name}: ${skill.description}`)
    .join("\n");

  return `Available skills:\n${skillList}\n\nOnly skill names and descriptions are loaded initially. When a user task matches a skill, call loadSkill with the registered skill name before applying the skill. Use readSkillResource for referenced files. Do not assume full skill instructions until loadSkill returns them.`;
}
