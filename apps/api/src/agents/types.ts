import type { UIMessage } from "ai";
import type { AstraDeps } from "./deps";
import type { SkillRegistry } from "./skills";

export type InternalChatRequest = {
  trigger?: string;
  id?: string;
  runId?: string;
  messages?: UIMessage[];
};

export type AgentRuntimeContext = {
  deps: AstraDeps;
  skills: SkillRegistry;
};
