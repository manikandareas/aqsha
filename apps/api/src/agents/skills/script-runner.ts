export type SandboxScriptInput = {
  skillName: string;
  scriptName: string;
  scriptPath: string;
  scriptDir: string;
  scriptContent: string;
  args: string[];
  timeoutMs: number;
  outputDir?: string;
  artifactRoot?: string;
  workspace: string;
  conversationId?: string;
  evidenceJson?: string;
  visualsJson?: string;
};

export type SandboxScriptArtifact = {
  name: string;
  relativePath: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
};

export type SandboxScriptResult = {
  ok: boolean;
  runner: "daytona";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifacts: SandboxScriptArtifact[];
  sandboxId?: string;
  runId?: string;
};

export type SandboxScriptRunner = (input: SandboxScriptInput) => Promise<SandboxScriptResult>;
