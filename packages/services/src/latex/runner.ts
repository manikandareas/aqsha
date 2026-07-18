export type RunResult = {
  /** null bila proses dibunuh karena timeout. */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  killedBy: string | null;
};

export type RunOptions = {
  cwd: string;
  timeoutMs: number;
  /** Env eksplisit; env proses induk TIDAK diwariskan (caller wajib pass PATH sendiri). */
  env?: Record<string, string | undefined>;
  maxOutputBytes?: number;
  /** Cap address-space via `ulimit -v` — efektif di Linux, no-op senyap di macOS. */
  maxMemoryKb?: number;
};

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

async function drainCapped(
  stream: ReadableStream<Uint8Array>,
  cap: number,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of stream) {
    // Terus drain melewati cap supaya pipe child tak penuh dan proses tak menggantung.
    if (out.length < cap) out += decoder.decode(chunk, { stream: true });
  }
  return out.slice(0, cap);
}

function withMemoryLimit(cmd: string[], maxMemoryKb?: number): string[] {
  if (!maxMemoryKb) return cmd;
  return [
    "/bin/sh",
    "-c",
    `ulimit -v ${maxMemoryKb} 2>/dev/null || true; exec "$@"`,
    "sh",
    ...cmd,
  ];
}

export async function runSandboxed(cmd: string[], opts: RunOptions): Promise<RunResult> {
  const proc = Bun.spawn({
    cmd: withMemoryLimit(cmd, opts.maxMemoryKb),
    cwd: opts.cwd,
    env: opts.env ?? {},
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill("SIGKILL");
  }, opts.timeoutMs);
  const cap = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const [stdout, stderr, exitCode] = await Promise.all([
    drainCapped(proc.stdout, cap),
    drainCapped(proc.stderr, cap),
    proc.exited,
  ]);
  clearTimeout(timer);
  return {
    exitCode: timedOut ? null : exitCode,
    stdout,
    stderr,
    timedOut,
    killedBy: proc.signalCode ?? null,
  };
}
