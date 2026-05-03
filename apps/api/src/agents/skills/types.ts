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

import type { AstraDeps } from "../deps";
import type { SandboxScriptRunner } from "./script-runner";

export type SkillToolContext = {
  registry: SkillRegistry;
  scriptsEnabled: boolean;
  scriptTimeoutMs: number;
  scriptRunner?: SandboxScriptRunner;
  deps: AstraDeps;
};
