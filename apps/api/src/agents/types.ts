import type { UIMessage } from "ai";
import type { AstraDeps } from "./deps";
import type { SkillRegistry } from "./skills/types";

export type InternalChatRequest = {
  trigger?: string;
  id?: string;
  runId?: string;
  messages?: UIMessage[];
};

export type AgentRuntimeContext = {
  deps: AstraDeps;
  skills: SkillRegistry;
  skillScriptsEnabled: boolean;
  skillScriptTimeoutMs: number;
  skillScriptRuntime: "daytona";
};
