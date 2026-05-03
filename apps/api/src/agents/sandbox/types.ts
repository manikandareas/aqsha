export type SandboxFile = {
  relativePath: string;
  content: string | Uint8Array;
  mode?: string;
};

export type SandboxExecInput = {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs: number;
  maxOutputBytes: number;
};

export type SandboxExecResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type SandboxDownloadedFile = {
  relativePath: string;
  content: Uint8Array;
  mimeType?: string;
  sizeBytes: number;
};

export type SandboxDownloadInput = {
  root: string;
  allowExtensions: string[];
  maxCount: number;
  maxBytesPerFile: number;
};

export interface AstraSandbox {
  readonly id?: string;
  uploadFiles(files: SandboxFile[]): Promise<void>;
  exec(input: SandboxExecInput): Promise<SandboxExecResult>;
  downloadFiles(input: SandboxDownloadInput): Promise<SandboxDownloadedFile[]>;
  close(): Promise<void>;
}

export type AstraSandboxFactory = () => Promise<AstraSandbox>;
