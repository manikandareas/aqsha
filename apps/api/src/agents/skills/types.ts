export type SkillMetadata = {
  name: string;
  description: string;
  directory: string;
  skillFile: string;
};

export type LoadedSkill = SkillMetadata & {
  content: string;
};

export type SkillRegistry = {
  skills: SkillMetadata[];
  byName: Map<string, SkillMetadata>;
};

export type SkillToolContext = {
  registry: SkillRegistry;
  scriptsEnabled: boolean;
  scriptTimeoutMs: number;
};
