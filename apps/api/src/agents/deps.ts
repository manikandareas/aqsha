export type AstraDeps = {
  userId: string;
  workspace: string;
  conversationId?: string;
  runId?: string;
  constraints: string[];
};

export function describeAstraDeps(deps: AstraDeps): string {
  const constraints = deps.constraints.length > 0 ? deps.constraints.join("; ") : "none";
  const conversationId = deps.conversationId?.trim() || "none";
  const runId = deps.runId?.trim() || "none";

  return `user_id=${deps.userId}; workspace=${deps.workspace}; conversation_id=${conversationId}; run_id=${runId}; constraints=${constraints}`;
}
