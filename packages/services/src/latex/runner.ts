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

/**
 * Single subprocess boundary for LaTeX compilation, dipakai dua runtime: Bun (API + worker)
 * dan Node (runtime agen Mastra di-bundle ke Node — `globalThis.Bun` tak ada di sana, sehingga
 * spawn lewat Bun melempar "Cannot read properties of undefined"). Pilih `Bun.spawn` bila global
 * Bun ada, kalau tidak jatuh ke `node:child_process` dengan kontrak stream/timeout/kill yang sama.
 * apps/web ikut men-typecheck file ini saat menurunkan tipe Eden `App` dan tak memuat bun-types —
 * jadi kedua runtime dicapai lewat surface bertipe lokal, bukan global ambient, agar type-graph
 * web tetap bebas dari global `Bun`.
 */
type SpawnedProcess = {
  stdout: AsyncIterable<Uint8Array>;
  stderr: AsyncIterable<Uint8Array>;
  exited: Promise<number>;
  readonly signalCode: string | null;
  kill(signal?: number | string): void;
};

type BunGlobal = {
  spawn(options: {
    cmd: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  }): SpawnedProcess;
};

type NodeChildProcess = {
  stdout: AsyncIterable<Uint8Array>;
  stderr: AsyncIterable<Uint8Array>;
  signalCode: string | null;
  kill(signal?: number | string): boolean;
  on(event: "close", listener: (code: number | null, signal: string | null) => void): void;
};

type NodeChildProcessModule = {
  spawn(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      stdio: ["ignore", "pipe", "pipe"];
    },
  ): NodeChildProcess;
};

const bunGlobal = (globalThis as unknown as { Bun?: BunGlobal }).Bun;

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
// Jeda flush setelah proses mati. Drain normal selesai jauh di bawah ini; batas
// ini hanya menjaga dari gantung saat proses yang dibunuh meninggalkan anak yatim
// yang masih memegang pipe stdout/stderr (mis. `sh -c "sleep"` di Linux).
const DRAIN_GRACE_MS = 200;

async function spawnProcess(cmd: string[], opts: RunOptions): Promise<SpawnedProcess> {
  if (bunGlobal) {
    return bunGlobal.spawn({
      cmd,
      cwd: opts.cwd,
      env: opts.env ?? {},
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  }
  // Runtime Node (agen Mastra): env diganti utuh (tanpa warisan induk, paritas Bun.spawn —
  // caller pass PATH sendiri). Buang nilai undefined supaya Node tak menstringifikasi jadi
  // "undefined".
  const { spawn } = (await import("node:child_process")) as unknown as NodeChildProcessModule;
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.env ?? {})) {
    if (value !== undefined) env[key] = value;
  }
  const child = spawn(cmd[0]!, cmd.slice(1), {
    cwd: opts.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = new Promise<number>((resolve) => {
    child.on("close", (code) => resolve(code ?? 0));
  });
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    exited,
    get signalCode() {
      return child.signalCode;
    },
    kill: (signal) => {
      child.kill(signal);
    },
  };
}

async function drainInto(
  stream: AsyncIterable<Uint8Array>,
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
  const proc = await spawnProcess(withMemoryLimit(cmd, opts.maxMemoryKb), opts);
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
