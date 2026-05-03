import { basename, posix } from "node:path";
import { readFile } from "node:fs/promises";
import { env as appEnv, resolveAppPath } from "../../config";
import { ASTRA_ARTIFACT_EXTENSIONS, persistArtifactRun } from "../artifacts/store";
import { createDaytonaSandbox } from "../sandbox/daytona";
import type { AstraSandbox, AstraSandboxFactory, SandboxDownloadedFile, SandboxFile } from "../sandbox/types";
import type { SandboxScriptResult, SandboxScriptRunner } from "./script-runner";

const REMOTE_SCRIPT_DIR = "scripts";
const REMOTE_OUTPUT_DIR = "artifacts";
const REMOTE_SRC_DIR = "src";
const REMOTE_INPUT_DIR = "input";
const ROOT_ARTIFACT_FILES = ["artifact_manifest.json", "visual_artifacts.md"];
const ASTRA_SUPPORT_FILES = ["__init__.py", "artifacts.py"];
const MAX_SANDBOX_OUTPUT_BYTES = 64 * 1024;
const MAX_SANDBOX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const MAX_SANDBOX_ARTIFACT_COUNT = 20;
const PYTHONPATH = "/home/daytona/astra/src";
const RUNTIME_PREFLIGHT_SCRIPT = `
import importlib.util
import sys
missing = [name for name in ("matplotlib", "pydantic") if importlib.util.find_spec(name) is None]
if missing:
    print("Missing Daytona Python dependencies: " + ", ".join(missing), file=sys.stderr)
    print("Set DAYTONA_IMAGE to an image built from apps/api/runtime/daytona-visual/Dockerfile.", file=sys.stderr)
    raise SystemExit(86)
`;

export type DaytonaScriptRunnerOptions = {
  createSandbox?: AstraSandboxFactory;
  maxOutputBytes?: number;
  maxArtifactBytes?: number;
  maxArtifactCount?: number;
};

export function createDaytonaScriptRunner({
  createSandbox = createDaytonaSandbox,
  maxOutputBytes = MAX_SANDBOX_OUTPUT_BYTES,
  maxArtifactBytes = MAX_SANDBOX_ARTIFACT_BYTES,
  maxArtifactCount = MAX_SANDBOX_ARTIFACT_COUNT,
}: DaytonaScriptRunnerOptions = {}): SandboxScriptRunner {
  return async (input) => {
    const sandbox = await createSandbox();

    try {
      await sandbox.uploadFiles([
        {
          relativePath: posix.join(REMOTE_SCRIPT_DIR, input.scriptName),
          content: input.scriptContent,
          mode: "644",
        },
        ...await astraSupportUploads(),
        ...inputUploads(input.evidenceJson, input.visualsJson),
      ]);

      const env = {
        ASTRA_SKILL_NAME: input.skillName,
        ASTRA_SCRIPT_NAME: input.scriptName,
        ASTRA_OUTPUT_DIR: REMOTE_OUTPUT_DIR,
        PYTHONPATH,
      };
      const preflight = await sandbox.exec({
        command: ["python3", "-c", RUNTIME_PREFLIGHT_SCRIPT],
        timeoutMs: Math.min(input.timeoutMs, 10_000),
        maxOutputBytes,
        env,
      });
      if (preflight.exitCode !== 0) {
        return {
          ok: false,
          runner: "daytona",
          exitCode: preflight.exitCode,
          stdout: preflight.stdout,
          stderr: preflight.stderr || preflight.stdout,
          artifacts: [],
          sandboxId: sandbox.id,
        } satisfies SandboxScriptResult;
      }

      const result = await sandbox.exec({
        command: ["python3", posix.join(REMOTE_SCRIPT_DIR, input.scriptName), ...input.args],
        timeoutMs: input.timeoutMs,
        maxOutputBytes,
        env,
      });

      const downloadedArtifacts = await downloadArtifacts(sandbox, input.outputDir ?? REMOTE_OUTPUT_DIR, maxArtifactCount, maxArtifactBytes);
      const persisted = downloadedArtifacts.length > 0
        ? await persistArtifactRun({
          artifactRoot: input.artifactRoot ?? resolveAppPath(appEnv.ASTRA_RESEARCH_ARTIFACT_DIR),
          workspace: input.workspace,
          conversationId: input.conversationId,
          artifacts: downloadedArtifacts.map((artifact) => ({
            relativePath: artifact.relativePath,
            content: artifact.content,
            mimeType: artifact.mimeType,
          })),
          maxArtifactBytes,
          maxArtifactCount,
        })
        : undefined;

      return {
        ok: result.exitCode === 0,
        runner: "daytona",
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        artifacts: persisted?.artifacts ?? downloadedArtifacts.map((artifact) => ({
          name: basename(artifact.relativePath),
          relativePath: artifact.relativePath,
          mimeType: artifact.mimeType,
          sizeBytes: artifact.sizeBytes,
        })),
        sandboxId: sandbox.id,
        runId: persisted?.runId,
      } satisfies SandboxScriptResult;
    } finally {
      await sandbox.close();
    }
  };
}

async function astraSupportUploads(): Promise<SandboxFile[]> {
  return Promise.all(ASTRA_SUPPORT_FILES.map(async (fileName) => ({
    relativePath: posix.join(REMOTE_SRC_DIR, "astra", fileName),
    content: await readFile(resolveAppPath(posix.join("src/astra", fileName)), "utf8"),
    mode: "644",
  })));
}

function inputUploads(evidenceJson?: string, visualsJson?: string): SandboxFile[] {
  const files: SandboxFile[] = [];
  if (evidenceJson) {
    files.push({ relativePath: posix.join(REMOTE_INPUT_DIR, "evidence.json"), content: evidenceJson, mode: "644" });
  }
  if (visualsJson) {
    files.push({ relativePath: posix.join(REMOTE_INPUT_DIR, "visuals.json"), content: visualsJson, mode: "644" });
  }
  return files;
}

async function downloadArtifacts(
  sandbox: AstraSandbox,
  outputDir: string,
  maxArtifactCount: number,
  maxArtifactBytes: number,
): Promise<SandboxDownloadedFile[]> {
  const artifacts = await sandbox.downloadFiles({
    root: outputDir,
    allowExtensions: [...ASTRA_ARTIFACT_EXTENSIONS],
    maxCount: maxArtifactCount,
    maxBytesPerFile: maxArtifactBytes,
  });

  for (const fileName of ROOT_ARTIFACT_FILES) {
    if (artifacts.length >= maxArtifactCount) {
      break;
    }

    const [file] = await sandbox.downloadFiles({
      root: fileName,
      allowExtensions: [...ASTRA_ARTIFACT_EXTENSIONS],
      maxCount: 1,
      maxBytesPerFile: maxArtifactBytes,
    });

    if (file) {
      artifacts.push(file);
    }
  }

  return artifacts;
}
