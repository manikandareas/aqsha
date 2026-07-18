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
// Jeda flush setelah proses mati. Drain normal selesai jauh di bawah ini; batas
// ini hanya menjaga dari gantung saat proses yang dibunuh meninggalkan anak yatim
// yang masih memegang pipe stdout/stderr (mis. `sh -c "sleep"` di Linux).
const DRAIN_GRACE_MS = 200;

async function drainInto(
  stream: ReadableStream<Uint8Array>,
  cap: number,
  sink: { text: string },
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    // Terus drain melewati cap supaya pipe child tak penuh dan proses tak menggantung.
    if (sink.text.length < cap) sink.text += decoder.decode(chunk, { stream: true });
  }
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
  const stdoutSink = { text: "" };
  const stderrSink = { text: "" };
  const drains = Promise.all([
    drainInto(proc.stdout, cap, stdoutSink).catch(() => {}),
    drainInto(proc.stderr, cap, stderrSink).catch(() => {}),
  ]);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  // Tunggu drain selesai, TAPI jangan menggantung: kalau proses dibunuh dan anak
  // yatim masih menahan pipe, drain tak akan pernah selesai — ambil output parsial.
  await new Promise<void>((resolve) => {
    const grace = setTimeout(resolve, DRAIN_GRACE_MS);
    void drains.finally(() => {
      clearTimeout(grace);
      resolve();
    });
  });
  return {
    exitCode: timedOut ? null : exitCode,
    stdout: stdoutSink.text.slice(0, cap),
    stderr: stderrSink.text.slice(0, cap),
    timedOut,
    killedBy: proc.signalCode ?? null,
  };
}
