// Backend selector for the chat/agent stack (plan §9.4 Step 2, dual-run D7).
// "legacy" = @convex-dev/agent runtime in packages/convex;
// "sdk"    = apps/agents service on first-party tables (chatThreads/...).
// Env-driven for now; per-user flagging arrives with the Step 6 cutover.

export type AgentBackend = "legacy" | "sdk";

export const AGENT_BACKEND: AgentBackend =
  process.env.NEXT_PUBLIC_AGENT_BACKEND === "sdk" ? "sdk" : "legacy";

export const isSdkBackend = AGENT_BACKEND === "sdk";
