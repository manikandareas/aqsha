import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { AQSHA_MCP_SERVER } from "../agent/toolPolicy";
import { buildArtifactTools } from "./artifacts";
import { buildAskUserTool } from "./askUser";
import { buildCitationTools } from "./citations";
import type { RunToolContext } from "./context";
import { buildResearchTools } from "./research";
import { buildSandboxTools } from "./sandbox";
import { buildWorkspaceTools } from "./workspace";

export { createCitationCounter, type RunToolContext } from "./context";
export { buildSandboxService, type SandboxService } from "./sandboxService";

// One in-process MCP server per run (plan §5.1): tool handlers close over the
// run context (identity, store, providers, broker, citation counter).
export function buildAqshaMcpServer(ctx: RunToolContext) {
  return createSdkMcpServer({
    name: AQSHA_MCP_SERVER,
    version: "1.0.0",
    tools: [
      ...buildResearchTools(ctx),
      ...buildCitationTools(ctx),
      ...buildArtifactTools(ctx),
      ...buildWorkspaceTools(ctx),
      buildAskUserTool(ctx),
      ...buildSandboxTools(ctx),
    ],
  });
}
