"use node";

// Vendor-neutral sandbox execution. This is the ONLY module that touches the
// Daytona SDK; everything above it speaks the `SandboxSessionRequest` /
// `SandboxCommandResult` contract, so swapping the sandbox vendor is contained to
// this file. Tier note (see spike): this account's Daytona tier has no sandbox
// egress, so every dependency must already live in the pre-baked snapshot — we
// never install at runtime. One verification provisions ONE sandbox, uploads all
// scripts + inputs once, then runs each command in it (statcheck + GRIM + power),
// and the sandbox is torn down in `finally` (best-effort), with `ephemeral` +
// `autoStopInterval` as the orphan safety net.

import { Daytona, DaytonaTimeoutError, type Sandbox } from "@daytona/sdk";

export interface SandboxFile {
  /** Absolute path inside the sandbox, e.g. "/workspace/check.R". */
  path: string;
  content: string;
}

export interface SandboxCommand {
  /** Caller-chosen id to correlate the result back to the command. */
  key: string;
  command: string;
  cwd: string;
}

export interface SandboxSessionRequest {
  apiKey: string;
  /** Pre-baked snapshot name (e.g. "aqsha-statverify-v1"). */
  snapshot: string;
  /** Files uploaded once, before any command runs (scripts + inputs). */
  files: SandboxFile[];
  commands: SandboxCommand[];
  /** Per-command execution timeout, in SECONDS (Daytona uses seconds, not ms). */
  timeoutSeconds: number;
}

export interface SandboxCommandResult {
  key: string;
  exitCode: number;
  stdout: string;
  timedOut: boolean;
}

// Seconds to wait for the sandbox to become ready. A warm pre-baked snapshot
// provisions in seconds; this is a generous ceiling.
const CREATE_TIMEOUT_SECONDS = 120;
// Idle minutes before Daytona auto-stops (then auto-deletes, since ephemeral
// forces autoDeleteInterval=0). Backstop if our explicit delete never runs.
const AUTO_STOP_MINUTES = 5;

/**
 * Provision one ephemeral sandbox, upload all files, run every command in it,
 * and return one result per command (preserving order). A command that times
 * out yields `timedOut: true` for its key and the remaining commands still run.
 * The sandbox is always torn down in `finally`.
 */
export async function runSandboxSession(
  req: SandboxSessionRequest,
): Promise<SandboxCommandResult[]> {
  const daytona = new Daytona({ apiKey: req.apiKey });
  let sandbox: Sandbox | undefined;
  try {
    sandbox = await daytona.create(
      {
        snapshot: req.snapshot,
        ephemeral: true,
        autoStopInterval: AUTO_STOP_MINUTES,
      },
      { timeout: CREATE_TIMEOUT_SECONDS },
    );

    for (const file of req.files) {
      await sandbox.fs.uploadFile(Buffer.from(file.content, "utf8"), file.path);
    }

    const results: SandboxCommandResult[] = [];
    for (const command of req.commands) {
      try {
        const response = await sandbox.process.executeCommand(
          command.command,
          command.cwd,
          undefined,
          req.timeoutSeconds,
        );
        results.push({
          key: command.key,
          exitCode: response.exitCode,
          stdout: response.result ?? "",
          timedOut: false,
        });
      } catch (error) {
        if (error instanceof DaytonaTimeoutError) {
          results.push({
            key: command.key,
            exitCode: -1,
            stdout: "",
            timedOut: true,
          });
          continue;
        }
        throw error;
      }
    }
    return results;
  } finally {
    if (sandbox) {
      try {
        await daytona.delete(sandbox);
      } catch {
        // Best-effort teardown; ephemeral + autoStopInterval guarantees the
        // sandbox is reaped even when this explicit delete fails.
      }
    }
  }
}
