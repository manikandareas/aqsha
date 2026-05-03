import { Buffer } from "node:buffer";
import { extname, isAbsolute, posix } from "node:path";
import { Daytona, type DaytonaConfig } from "@daytonaio/sdk";
import type { Sandbox } from "@daytonaio/sdk";
import { env } from "../../config";
import { trimOutput } from "../skills/path-safety";
import type { AstraSandbox, SandboxDownloadedFile, SandboxExecInput, SandboxFile } from "./types";

const WORKSPACE_DIR = "/home/daytona/astra";
const DAYTONA_SANDBOX_AUTO_STOP_MINUTES = 15;
const DAYTONA_SANDBOX_CREATE_TIMEOUT_SECONDS = 180;

export type DaytonaSandboxFactoryOptions = {
  apiKey?: string;
  apiUrl?: string;
  target?: string;
  image?: string;
};

export async function createDaytonaSandbox({
  apiKey = env.DAYTONA_API_KEY,
  apiUrl = env.DAYTONA_API_URL,
  target = env.DAYTONA_TARGET,
  image = env.DAYTONA_IMAGE,
}: DaytonaSandboxFactoryOptions = {}): Promise<AstraSandbox> {
  if (!apiKey) {
    throw new Error("Daytona sandbox execution requires DAYTONA_API_KEY.");
  }

  const daytona = new Daytona(cleanDaytonaConfig({ apiKey, apiUrl, target }));
  let sandbox: Sandbox | null = null;

  try {
    const createParams = {
      ...(image ? { image } : {}),
      language: "python",
      ephemeral: true,
      autoStopInterval: DAYTONA_SANDBOX_AUTO_STOP_MINUTES,
      labels: sandboxLabels(),
    };

    sandbox = await daytona.create(createParams, { timeout: DAYTONA_SANDBOX_CREATE_TIMEOUT_SECONDS });

    await sandbox.fs.createFolder(WORKSPACE_DIR, "755");
    return new DaytonaAstraSandbox(daytona, sandbox, WORKSPACE_DIR);
  } catch (error) {
    logDaytonaError("Failed to create Daytona sandbox", error, {
      hasImage: Boolean(image),
      target: target ?? null,
      apiUrl: apiUrl ?? null,
    });
    if (sandbox) {
      await sandbox.delete().catch(() => {});
    }
    await daytona[Symbol.asyncDispose]?.().catch(() => {});
    throw error;
  }
}

class DaytonaAstraSandbox implements AstraSandbox {
  readonly id: string;

  constructor(
    private readonly daytona: Daytona,
    private readonly sandbox: Sandbox,
    private readonly workspaceDir: string,
  ) {
    this.id = sandbox.id;
  }

  async uploadFiles(files: SandboxFile[]): Promise<void> {
    await this.sandbox.fs.uploadFiles(files.map((file) => ({
      source: Buffer.from(file.content),
      destination: this.remotePath(file.relativePath),
    })));

    for (const file of files) {
      if (file.mode) {
        await this.sandbox.fs.setFilePermissions(this.remotePath(file.relativePath), { mode: file.mode });
      }
    }
  }

  async exec({ command, cwd, env, timeoutMs, maxOutputBytes }: SandboxExecInput) {
    if (command.length === 0) {
      throw new Error("Sandbox command is required.");
    }

    const commandText = command.map(shellQuote).join(" ");
    const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
    let result;
    try {
      result = await this.sandbox.process.executeCommand(
        commandText,
        cwd ? this.remotePath(cwd) : this.workspaceDir,
        env,
        timeoutSeconds,
      );
    } catch (error) {
      logDaytonaError("Failed to execute Daytona sandbox command", error, {
        sandboxId: this.id,
        cwd: cwd ?? ".",
        command: command[0],
      });
      throw error;
    }

    const artifacts = result.artifacts as { stdout?: string; stderr?: string } | undefined;
    return {
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      stdout: trimOutput(artifacts?.stdout ?? result.result ?? "", maxOutputBytes),
      stderr: trimOutput(artifacts?.stderr ?? "", maxOutputBytes),
    };
  }

  async downloadFiles({ root, allowExtensions, maxCount, maxBytesPerFile }: Parameters<AstraSandbox["downloadFiles"]>[0]) {
    const normalizedRoot = normalizeRelativePath(root);
    let files: Array<{ relativePath: string; sizeBytes: number }>;
    try {
      files = await this.collectFiles(normalizedRoot, allowExtensions, maxCount, maxBytesPerFile);
      if (files.length === 0) {
        files = await this.collectSingleFile(normalizedRoot, allowExtensions, maxBytesPerFile);
      }
    } catch (error) {
      logDaytonaError("Failed to list Daytona sandbox artifacts", error, {
        sandboxId: this.id,
        root: normalizedRoot,
      });
      throw error;
    }
    const downloaded: SandboxDownloadedFile[] = [];

    for (const file of files) {
      let content: Buffer;
      try {
        content = await this.sandbox.fs.downloadFile(this.remotePath(file.relativePath));
      } catch (error) {
        logDaytonaError("Failed to download Daytona sandbox artifact", error, {
          sandboxId: this.id,
          artifactPath: file.relativePath,
        });
        throw error;
      }
      if (content.byteLength > maxBytesPerFile) {
        throw new Error(`Sandbox artifact exceeds size limit: ${file.relativePath}`);
      }
      downloaded.push({
        relativePath: file.relativePath,
        content,
        sizeBytes: content.byteLength,
        mimeType: mimeTypeFor(file.relativePath),
      });
    }

    return downloaded;
  }

  async close(): Promise<void> {
    try {
      await this.sandbox.delete();
    } finally {
      await this.daytona[Symbol.asyncDispose]?.();
    }
  }

  private async collectSingleFile(
    relativePath: string,
    allowExtensions: string[],
    maxBytesPerFile: number,
  ): Promise<Array<{ relativePath: string; sizeBytes: number }>> {
    const extension = extname(relativePath).toLowerCase();
    if (!allowExtensions.map((item) => item.toLowerCase()).includes(extension)) {
      return [];
    }

    const content = await this.sandbox.fs.downloadFile(this.remotePath(relativePath)).catch(() => null);
    if (!content) {
      return [];
    }
    if (content.byteLength > maxBytesPerFile) {
      throw new Error(`Sandbox artifact exceeds size limit: ${relativePath}`);
    }
    return [{ relativePath, sizeBytes: content.byteLength }];
  }

  private async collectFiles(
    root: string,
    allowExtensions: string[],
    maxCount: number,
    maxBytesPerFile: number,
  ): Promise<Array<{ relativePath: string; sizeBytes: number }>> {
    const pending = [root];
    const files: Array<{ relativePath: string; sizeBytes: number }> = [];
    const allowed = new Set(allowExtensions.map((extension) => extension.toLowerCase()));

    while (pending.length > 0) {
      const current = pending.shift() as string;
      const entries = await this.sandbox.fs.listFiles(this.remotePath(current)).catch(() => []);

      for (const entry of entries) {
        const relativePath = normalizeRelativePath(posix.join(current, entry.name));
        if (entry.isDir) {
          pending.push(relativePath);
          continue;
        }

        const extension = extname(relativePath).toLowerCase();
        if (!allowed.has(extension)) {
          continue;
        }

        if (entry.size > maxBytesPerFile) {
          throw new Error(`Sandbox artifact exceeds size limit: ${relativePath}`);
        }

        files.push({ relativePath, sizeBytes: entry.size });
        if (files.length > maxCount) {
          throw new Error(`Sandbox produced too many artifacts. Max allowed: ${maxCount}.`);
        }
      }
    }

    return files;
  }

  private remotePath(relativePath: string): string {
    return posix.join(this.workspaceDir, normalizeRelativePath(relativePath));
  }
}

function logDaytonaError(message: string, error: unknown, details: Record<string, unknown> = {}) {
  const record = errorRecord(error);
  console.error(JSON.stringify({
    level: "error",
    module: "agents.sandbox.daytona",
    message,
    ...details,
    ...record,
  }));
}

function errorRecord(error: unknown): Record<string, unknown> {
  const record: Record<string, unknown> = {};

  if (error instanceof Error) {
    record.errorName = error.name;
    record.errorMessage = sanitizeErrorText(error.message);
    record.stack = sanitizeErrorText(error.stack);
  } else if (error !== undefined) {
    record.error = sanitizeErrorText(String(error));
  }

  const maybeAxios = error as {
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
    errorCode?: unknown;
    headers?: unknown;
    response?: {
      status?: unknown;
      statusText?: unknown;
      data?: unknown;
      headers?: unknown;
    };
    config?: {
      url?: unknown;
      method?: unknown;
      baseURL?: unknown;
    };
  };

  if (maybeAxios.code) {
    record.axiosCode = maybeAxios.code;
  }

  if (maybeAxios.status) {
    record.status = maybeAxios.status;
  }

  if (maybeAxios.statusCode) {
    record.statusCode = maybeAxios.statusCode;
  }

  if (maybeAxios.errorCode) {
    record.errorCode = maybeAxios.errorCode;
  }

  if (maybeAxios.response) {
    record.responseStatus = maybeAxios.response.status;
    record.responseStatusText = maybeAxios.response.statusText;
    record.responseData = redactSecrets(maybeAxios.response.data);
  }

  if (maybeAxios.config) {
    record.requestMethod = maybeAxios.config.method;
    record.requestUrl = sanitizeErrorText(String(maybeAxios.config.url ?? ""));
    record.requestBaseURL = sanitizeErrorText(String(maybeAxios.config.baseURL ?? ""));
  }

  return record;
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeErrorText(value);
  }

  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }

  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/authorization|api[-_]?key|token|secret|password/i.test(key)) {
        return [key, "[redacted]"];
      }
      return [key, redactSecrets(item)];
    }));
  }

  return value;
}

function sanitizeErrorText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  let sanitized = value;
  if (env.DAYTONA_API_KEY) {
    sanitized = sanitized.replaceAll(env.DAYTONA_API_KEY, "[redacted]");
  }
  return sanitized;
}

function cleanDaytonaConfig(config: DaytonaConfig): DaytonaConfig {
  return Object.fromEntries(Object.entries(config).filter(([, value]) => value !== undefined && value !== "")) as DaytonaConfig;
}

function sandboxLabels(): Record<string, string> {
  return {
    app: "aqsha",
    component: "astra",
    purpose: "skill-script",
  };
}

function normalizeRelativePath(path: string): string {
  if (!path.trim()) {
    throw new Error("Sandbox path is required.");
  }

  if (path.includes("\0") || isAbsolute(path)) {
    throw new Error("Sandbox path must be a safe relative path.");
  }

  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length === 0 || parts.includes("..") || parts.some((part) => part.startsWith("."))) {
    throw new Error("Sandbox path must not traverse or target hidden files.");
  }

  return parts.join("/");
}

function shellQuote(value: string): string {
  if (/^[a-zA-Z0-9_./:=@+-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function mimeTypeFor(path: string): string | undefined {
  switch (extname(path).toLowerCase()) {
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".json":
      return "application/json";
    case ".md":
      return "text/markdown";
    default:
      return undefined;
  }
}
