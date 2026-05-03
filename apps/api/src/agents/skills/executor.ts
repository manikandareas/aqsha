import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, sep } from "node:path";
import { Daytona } from "@daytona/sdk";
import { z } from "zod";
import { MAX_SCRIPT_OUTPUT_BYTES, resolveConfinedPath, trimOutput } from "./path-safety";
import type { SkillMetadata } from "./types";

export const trustedScriptErrorCodes = [
  "unknown_skill",
  "unknown_script",
  "invalid_script_id",
  "unsupported_runtime",
  "args_limit_exceeded",
  "timeout",
  "output_limit_exceeded",
  "sandbox_create_failed",
  "sandbox_dependency_failed",
  "script_failed",
  "artifact_missing",
  "artifact_retrieval_failed",
  "unknown",
] as const;

export type TrustedScriptErrorCode = (typeof trustedScriptErrorCodes)[number];

export type TrustedScriptError = {
  code: TrustedScriptErrorCode;
  message: string;
  detail?: unknown;
};

export type ScriptArtifactOutput = {
  path: string;
  contentType: string;
  role?: string;
};

export type SkillScriptDefinition = {
  id: string;
  file: string;
  runtime: "bun";
  timeoutMs: number;
  args: {
    maxCount: number;
    maxLength: number;
  };
  outputs: ScriptArtifactOutput[];
  network: "disabled" | "enabled";
};

export type SkillScriptManifest = {
  version: 1;
  scripts: SkillScriptDefinition[];
};

export type ResolvedSkillScript = SkillScriptDefinition & {
  filePath: string;
  scriptsDirectory: string;
};

export type ScriptArtifactMetadata = {
  path: string;
  contentType: string;
  byteSize: number;
  checksum: string;
  role?: string;
  retrievalStatus: "available";
  bytes?: Uint8Array;
};

export type SkillScriptExecutionInput = {
  skillName: string;
  script: ResolvedSkillScript;
  args: string[];
  runId?: string;
  imageRef?: string;
  includeArtifactBytes?: boolean;
};

export type SkillScriptExecutionSuccess = {
  ok: true;
  backend: "local" | "daytona" | "fake";
  skillName: string;
  scriptId: string;
  runtime: "bun";
  runId?: string;
  imageRef?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  artifacts: ScriptArtifactMetadata[];
};

export type SkillScriptExecutionFailure = {
  ok: false;
  backend: "local" | "daytona" | "fake";
  skillName: string;
  scriptId: string;
  runtime: "bun";
  runId?: string;
  imageRef?: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifacts: ScriptArtifactMetadata[];
  error: TrustedScriptError;
};

export type SkillScriptExecutionResult =
  | SkillScriptExecutionSuccess
  | SkillScriptExecutionFailure;

export interface SkillScriptExecutor {
  execute(input: SkillScriptExecutionInput): Promise<SkillScriptExecutionResult>;
}

export type DaytonaScriptExecutorClientInput = {
  imageRef: string;
  skillName: string;
  runId?: string;
  command: string[];
  timeoutMs: number;
  outputs: ScriptArtifactOutput[];
  network: "disabled" | "enabled";
  includeArtifactBytes?: boolean;
};

export type DaytonaScriptExecutorClientResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  artifacts: ScriptArtifactMetadata[];
  error?: TrustedScriptError;
};

export type DaytonaScriptExecutorClient = {
  execute(input: DaytonaScriptExecutorClientInput): Promise<DaytonaScriptExecutorClientResult>;
};

type DaytonaSandboxLike = {
  id: string;
  process: {
    executeCommand(
      command: string,
      cwd?: string,
      env?: Record<string, string>,
      timeout?: number,
    ): Promise<{
      exitCode: number;
      result: string;
      artifacts?: {
        stdout?: string;
      };
    }>;
  };
  fs: {
    downloadFile(path: string): Promise<Buffer>;
  };
};

type DaytonaLike = {
  create(
    params: {
      image: string;
      language: string;
      labels: Record<string, string>;
      networkBlockAll: boolean;
      ephemeral: boolean;
      autoStopInterval: number;
      autoArchiveInterval: number;
      autoDeleteInterval: number;
    },
    options?: { timeout?: number },
  ): Promise<DaytonaSandboxLike>;
  delete(sandbox: DaytonaSandboxLike, timeout?: number): Promise<void>;
};

const SCRIPT_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

const scriptDefinitionSchema = z.object({
  id: z.string().min(1),
  file: z.string().min(1),
  runtime: z.literal("bun"),
  timeoutMs: z.number().int().positive(),
  args: z
    .object({
      maxCount: z.number().int().nonnegative(),
      maxLength: z.number().int().positive(),
    })
    .default({ maxCount: 20, maxLength: 500 }),
  outputs: z
    .array(
      z.object({
        path: z.string().min(1),
        contentType: z.string().min(1),
        role: z.string().min(1).optional(),
      }),
    )
    .default([]),
  network: z.enum(["disabled", "enabled"]).default("disabled"),
});

const manifestSchema = z.object({
  version: z.literal(1),
  scripts: z.array(scriptDefinitionSchema),
});

export async function loadSkillScriptManifest(skill: SkillMetadata): Promise<SkillScriptManifest> {
  const manifestPath = await resolveConfinedPath(skill.directory, "scripts/manifest.json");
  return manifestSchema.parse(JSON.parse(await readFile(manifestPath, "utf8")));
}

export async function resolveSkillScript({
  skill,
  manifest,
  scriptId,
}: {
  skill: SkillMetadata;
  manifest: SkillScriptManifest;
  scriptId: string;
}): Promise<
  | {
      ok: true;
      script: ResolvedSkillScript;
    }
  | {
      ok: false;
      error: TrustedScriptError;
    }
> {
  if (!SCRIPT_ID_PATTERN.test(scriptId) || basename(scriptId) !== scriptId) {
    return {
      ok: false,
      error: {
        code: "invalid_script_id",
        message: "Script id must be an allowlisted id, not a path.",
      },
    };
  }

  const script = manifest.scripts.find((candidate) => candidate.id === scriptId);
  if (!script) {
    return {
      ok: false,
      error: {
        code: "unknown_script",
        message: `Unknown trusted skill script: ${scriptId}`,
      },
    };
  }

  if (script.runtime !== "bun") {
    return {
      ok: false,
      error: {
        code: "unsupported_runtime",
        message: `Unsupported trusted skill script runtime: ${script.runtime}`,
      },
    };
  }

  if (!SCRIPT_ID_PATTERN.test(script.file) || basename(script.file) !== script.file) {
    return {
      ok: false,
      error: {
        code: "invalid_script_id",
        message: "Manifest script file must be a filename directly under scripts/.",
      },
    };
  }

  const filePath = await resolveConfinedPath(skill.directory, join("scripts", script.file));
  const scriptsDirectory = await resolveConfinedPath(skill.directory, "scripts");

  if (dirname(filePath) !== scriptsDirectory) {
    return {
      ok: false,
      error: {
        code: "invalid_script_id",
        message: "Manifest script file must resolve directly under scripts/.",
      },
    };
  }

  return {
    ok: true,
    script: {
      ...script,
      filePath,
      scriptsDirectory,
    },
  };
}

export class LocalScriptExecutor implements SkillScriptExecutor {
  async execute(input: SkillScriptExecutionInput): Promise<SkillScriptExecutionResult> {
    const argsError = validateArgs(input.script, input.args);
    if (argsError) {
      return failureResult("local", input, {
        exitCode: null,
        stdout: "",
        stderr: "",
        artifacts: [],
        error: argsError,
      });
    }

    const processResult = await runBunScript(input.script, input.args);
    if (processResult.timedOut) {
      return failureResult("local", input, {
        exitCode: null,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        artifacts: [],
        error: {
          code: "timeout",
          message: `Trusted skill script timed out after ${input.script.timeoutMs}ms.`,
        },
      });
    }

    if (processResult.outputExceeded) {
      return failureResult("local", input, {
        exitCode: processResult.exitCode,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        artifacts: [],
        error: {
          code: "output_limit_exceeded",
          message: `Trusted skill script output exceeded ${MAX_SCRIPT_OUTPUT_BYTES} bytes.`,
        },
      });
    }

    let artifacts: ScriptArtifactMetadata[];
    try {
      artifacts = await collectArtifactMetadata(input.script, input.includeArtifactBytes ?? false);
    } catch (error) {
      return failureResult("local", input, {
        exitCode: processResult.exitCode,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        artifacts: [],
        error: {
          code: "artifact_retrieval_failed",
          message: error instanceof Error ? error.message : "Artifact retrieval failed.",
        },
      });
    }

    if (input.script.outputs.length > 0 && artifacts.length === 0) {
      return failureResult("local", input, {
        exitCode: processResult.exitCode,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        artifacts: [],
        error: {
          code: "artifact_missing",
          message: "Trusted skill script did not produce any declared artifacts.",
        },
      });
    }

    if (processResult.exitCode !== 0) {
      return failureResult("local", input, {
        exitCode: processResult.exitCode,
        stdout: processResult.stdout,
        stderr: processResult.stderr,
        artifacts,
        error: {
          code: "script_failed",
          message: `Trusted skill script exited with code ${processResult.exitCode}.`,
        },
      });
    }

    return {
      ok: true,
      backend: "local",
      skillName: input.skillName,
      scriptId: input.script.id,
      runtime: input.script.runtime,
      runId: input.runId,
      imageRef: input.imageRef,
      exitCode: processResult.exitCode,
      stdout: processResult.stdout,
      stderr: processResult.stderr,
      artifacts,
    };
  }
}

export class DaytonaScriptExecutor implements SkillScriptExecutor {
  constructor(
    private readonly options: {
      imageRef: string;
      client: DaytonaScriptExecutorClient;
    },
  ) {}

  async execute(input: SkillScriptExecutionInput): Promise<SkillScriptExecutionResult> {
    const argsError = validateArgs(input.script, input.args);
    if (argsError) {
      return failureResult("daytona", { ...input, imageRef: this.options.imageRef }, {
        exitCode: null,
        stdout: "",
        stderr: "",
        artifacts: [],
        error: argsError,
      });
    }

    let result: DaytonaScriptExecutorClientResult;
    try {
      result = await this.options.client.execute({
        imageRef: this.options.imageRef,
        skillName: input.skillName,
        runId: input.runId,
        command: createDaytonaScriptCommand(input.script.file, input.args),
        timeoutMs: input.script.timeoutMs,
        outputs: input.script.outputs,
        network: input.script.network,
        includeArtifactBytes: input.includeArtifactBytes,
      });
    } catch (error) {
      return failureResult("daytona", { ...input, imageRef: this.options.imageRef }, {
        exitCode: null,
        stdout: "",
        stderr: "",
        artifacts: [],
        error: {
          code: "sandbox_create_failed",
          message: error instanceof Error ? error.message : "Daytona sandbox execution failed.",
        },
      });
    }

    if (result.error) {
      return failureResult("daytona", { ...input, imageRef: this.options.imageRef }, {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        artifacts: result.artifacts,
        error: result.error,
      });
    }

    if (input.script.outputs.length > 0 && result.artifacts.length === 0) {
      return failureResult("daytona", { ...input, imageRef: this.options.imageRef }, {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        artifacts: [],
        error: {
          code: "artifact_missing",
          message: "Trusted skill script did not produce any declared artifacts.",
        },
      });
    }

    if (result.exitCode !== 0) {
      return failureResult("daytona", { ...input, imageRef: this.options.imageRef }, {
        ...result,
        error: {
          code: "script_failed",
          message: `Trusted skill script exited with code ${result.exitCode}.`,
        },
      });
    }

    return {
      ok: true,
      backend: "daytona",
      skillName: input.skillName,
      scriptId: input.script.id,
      runtime: input.script.runtime,
      runId: input.runId,
      imageRef: this.options.imageRef,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      artifacts: result.artifacts,
    };
  }
}

export class DaytonaSdkScriptExecutorClient implements DaytonaScriptExecutorClient {
  private readonly daytona: DaytonaLike;
  private readonly skillScriptsRoot: string;
  private readonly createTimeoutSeconds: number;
  private readonly deleteTimeoutSeconds: number;

  constructor(options: {
    daytona?: DaytonaLike;
    apiKey?: string;
    apiUrl?: string;
    target?: string;
    skillScriptsRoot?: string;
    createTimeoutSeconds?: number;
    deleteTimeoutSeconds?: number;
  } = {}) {
    this.daytona =
      options.daytona ??
      (new Daytona({
        apiKey: options.apiKey,
        apiUrl: options.apiUrl,
        target: options.target,
      }) as DaytonaLike);
    this.skillScriptsRoot = options.skillScriptsRoot ?? "/workspace/apps/api/skills";
    this.createTimeoutSeconds = options.createTimeoutSeconds ?? 60;
    this.deleteTimeoutSeconds = options.deleteTimeoutSeconds ?? 30;
  }

  async execute(input: DaytonaScriptExecutorClientInput): Promise<DaytonaScriptExecutorClientResult> {
    const sandbox = await this.daytona.create(
      {
        image: input.imageRef,
        language: "typescript",
        labels: {
          aqshaRunId: input.runId ?? "unknown",
          aqshaSkillName: input.skillName,
        },
        networkBlockAll: input.network === "disabled",
        ephemeral: true,
        autoStopInterval: Math.max(1, Math.ceil(input.timeoutMs / 60_000)),
        autoArchiveInterval: 0,
        autoDeleteInterval: 0,
      },
      { timeout: this.createTimeoutSeconds },
    );

    try {
      const cwd = posix.join(this.skillScriptsRoot, input.skillName, "scripts");
      const commandResult = await sandbox.process.executeCommand(
        toShellCommand(input.command),
        cwd,
        {},
        Math.ceil(input.timeoutMs / 1000),
      );
      const artifacts = await this.collectArtifacts(
        sandbox,
        cwd,
        input.outputs,
        input.includeArtifactBytes ?? false,
      );

      return {
        exitCode: commandResult.exitCode,
        stdout: commandResult.artifacts?.stdout ?? commandResult.result ?? "",
        stderr: "",
        artifacts,
      };
    } finally {
      await this.daytona.delete(sandbox, this.deleteTimeoutSeconds);
    }
  }

  private async collectArtifacts(
    sandbox: DaytonaSandboxLike,
    cwd: string,
    outputs: ScriptArtifactOutput[],
    includeArtifactBytes: boolean,
  ): Promise<ScriptArtifactMetadata[]> {
    const artifacts: ScriptArtifactMetadata[] = [];

    for (const output of outputs) {
      for (const artifactPath of await this.resolveRemoteOutputMatches(sandbox, cwd, output.path)) {
        const bytes = await sandbox.fs.downloadFile(artifactPath);
        const artifact: ScriptArtifactMetadata = {
          path: toPosixRelativeArtifactPath(cwd, artifactPath),
          contentType: output.contentType,
          byteSize: bytes.byteLength,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          role: output.role,
          retrievalStatus: "available",
        };
        if (includeArtifactBytes) {
          artifact.bytes = new Uint8Array(bytes);
        }
        artifacts.push(artifact);
      }
    }

    return artifacts;
  }

  private async resolveRemoteOutputMatches(
    sandbox: DaytonaSandboxLike,
    cwd: string,
    outputPath: string,
  ): Promise<string[]> {
    assertSafeArtifactPath(outputPath);

    if (!outputPath.includes("*")) {
      return [posix.join(cwd, outputPath)];
    }

    const parts = outputPath.split(/[\\/]+/);
    const filePattern = parts.pop();
    if (!filePattern || filePattern.indexOf("*") !== filePattern.lastIndexOf("*")) {
      throw new Error("Artifact output glob must contain one filename wildcard.");
    }

    const directory = posix.join(cwd, ...parts);
    const result = await sandbox.process.executeCommand(
      `find ${shellQuote(directory)} -maxdepth 1 -type f -name ${shellQuote(filePattern)}`,
      cwd,
      {},
      10,
    );

    if (result.exitCode !== 0) {
      return [];
    }

    return result.result
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
}

function validateArgs(script: ResolvedSkillScript, args: string[]): TrustedScriptError | null {
  if (args.length > script.args.maxCount || args.some((arg) => arg.length > script.args.maxLength)) {
    return {
      code: "args_limit_exceeded",
      message: "Script arguments exceed manifest limits.",
    };
  }

  return null;
}

function createDaytonaScriptCommand(scriptFile: string, args: string[]): string[] {
  const specJsonBase64Index = args.indexOf("--spec-json-base64");

  if (specJsonBase64Index === -1) {
    return ["bun", scriptFile, ...args];
  }

  const specJsonBase64 = args[specJsonBase64Index + 1];
  if (!specJsonBase64) {
    return ["bun", scriptFile, ...args];
  }

  const specPath = `.aqsha-inputs/visual-spec-${createHash("sha256")
    .update(specJsonBase64)
    .digest("hex")
    .slice(0, 12)}.json`;
  const rendererArgs = [
    ...args.slice(0, specJsonBase64Index),
    "--spec",
    specPath,
    ...args.slice(specJsonBase64Index + 2),
  ];
  const writeSpecCommand = toShellCommand([
    "bun",
    "-e",
    `await Bun.write(${JSON.stringify(specPath)}, Buffer.from(${JSON.stringify(specJsonBase64)}, "base64"));`,
  ]);
  const renderCommand = toShellCommand(["bun", scriptFile, ...rendererArgs]);

  return ["sh", "-lc", `mkdir -p .aqsha-inputs && ${writeSpecCommand} && ${renderCommand}`];
}

function failureResult(
  backend: "local" | "daytona" | "fake",
  input: SkillScriptExecutionInput,
  result: {
    exitCode: number | null;
    stdout: string;
    stderr: string;
    artifacts: ScriptArtifactMetadata[];
    error: TrustedScriptError;
  },
): SkillScriptExecutionFailure {
  return {
    ok: false,
    backend,
    skillName: input.skillName,
    scriptId: input.script.id,
    runtime: input.script.runtime,
    runId: input.runId,
    imageRef: input.imageRef,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    artifacts: result.artifacts,
    error: result.error,
  };
}

async function runBunScript(script: ResolvedSkillScript, args: string[]): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  outputExceeded: boolean;
}> {
  return await new Promise((resolve) => {
    const child = spawn(process.execPath, [script.filePath, ...args], {
      cwd: script.scriptsDirectory,
      env: {
        ...process.env,
        PATH: process.env.PATH ?? "/usr/bin:/bin",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let outputExceeded = false;
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGKILL");
      resolve({ exitCode: null, stdout, stderr, timedOut: true, outputExceeded });
    }, script.timeoutMs);

    child.stdout.on("data", (chunk) => {
      const next = stdout + String(chunk);
      outputExceeded ||= new TextEncoder().encode(next).byteLength > MAX_SCRIPT_OUTPUT_BYTES;
      stdout = trimOutput(next, MAX_SCRIPT_OUTPUT_BYTES);
    });

    child.stderr.on("data", (chunk) => {
      const next = stderr + String(chunk);
      outputExceeded ||= new TextEncoder().encode(next).byteLength > MAX_SCRIPT_OUTPUT_BYTES;
      stderr = trimOutput(next, MAX_SCRIPT_OUTPUT_BYTES);
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout,
        stderr: trimOutput(stderr + error.message),
        timedOut: false,
        outputExceeded,
      });
    });

    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut: false, outputExceeded });
    });
  });
}

async function collectArtifactMetadata(
  script: ResolvedSkillScript,
  includeArtifactBytes: boolean,
): Promise<ScriptArtifactMetadata[]> {
  const artifacts: ScriptArtifactMetadata[] = [];

  for (const output of script.outputs) {
    for (const artifactPath of await resolveOutputMatches(script.scriptsDirectory, output.path)) {
      const info = await stat(artifactPath);
      const bytes = await readFile(artifactPath);
      const artifact: ScriptArtifactMetadata = {
        path: toRelativeArtifactPath(script.scriptsDirectory, artifactPath),
        contentType: output.contentType,
        byteSize: info.size,
        checksum: createHash("sha256").update(bytes).digest("hex"),
        role: output.role,
        retrievalStatus: "available",
      };
      if (includeArtifactBytes) {
        artifact.bytes = new Uint8Array(bytes);
      }
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

async function resolveOutputMatches(root: string, outputPath: string): Promise<string[]> {
  assertSafeArtifactPath(outputPath);

  if (!outputPath.includes("*")) {
    return [join(root, outputPath)];
  }

  const parts = outputPath.split(/[\\/]+/);
  const filePattern = parts.pop();
  if (!filePattern || filePattern.indexOf("*") !== filePattern.lastIndexOf("*")) {
    throw new Error("Artifact output glob must contain one filename wildcard.");
  }

  const directory = join(root, ...parts);
  const [prefix, suffix] = filePattern.split("*");
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNotFound(error)) {
      return [];
    }
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix ?? "") && entry.name.endsWith(suffix ?? ""))
    .map((entry) => join(directory, entry.name));
}

function isNotFound(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function toRelativeArtifactPath(root: string, artifactPath: string): string {
  const path = relative(root, artifactPath);
  if (path.startsWith("..") || path.startsWith(sep) || isAbsolute(path)) {
    throw new Error("Artifact path escapes the script workdir.");
  }

  return path.split(sep).join("/");
}

function toPosixRelativeArtifactPath(root: string, artifactPath: string): string {
  const path = posix.relative(root, artifactPath);
  if (path.startsWith("..") || path.startsWith("/") || posix.isAbsolute(path)) {
    throw new Error("Artifact path escapes the script workdir.");
  }

  return path;
}

function assertSafeArtifactPath(outputPath: string): void {
  if (isAbsolute(outputPath) || posix.isAbsolute(outputPath) || outputPath.split(/[\\/]+/).includes("..")) {
    throw new Error("Artifact output path must stay inside the script workdir.");
  }
}

function toShellCommand(command: string[]): string {
  return command.map(shellQuote).join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
