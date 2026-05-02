export type AstraDeps = {
  userId: string;
  workspace: string;
  conversationId?: string;
  researchArtifactDir?: string;
  constraints: string[];
};

export function describeAstraDeps(deps: AstraDeps): string {
  const constraints = deps.constraints.length > 0 ? deps.constraints.join("; ") : "none";
  const conversationId = deps.conversationId?.trim() || "none";
  const artifactDir = deps.researchArtifactDir?.trim() || "none";

  return `user_id=${deps.userId}; workspace=${deps.workspace}; conversation_id=${conversationId}; research_artifact_dir=${artifactDir}; constraints=${constraints}`;
}
