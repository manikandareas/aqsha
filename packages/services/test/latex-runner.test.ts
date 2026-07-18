import { describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { runSandboxed } from "../src/latex/runner";

const CWD = tmpdir();

describe("runSandboxed", () => {
  test("menjalankan perintah dan menangkap stdout + exit code", async () => {
    const result = await runSandboxed(["/bin/sh", "-c", "echo halo && exit 0"], {
      cwd: CWD,
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("halo");
    expect(result.timedOut).toBe(false);
  });

  test("meneruskan exit code bukan-nol dan stderr", async () => {
    const result = await runSandboxed(["/bin/sh", "-c", "echo galat >&2; exit 3"], {
      cwd: CWD,
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(3);
    expect(result.stderr.trim()).toBe("galat");
  });

  test("timeout → kill, timedOut=true, exitCode=null", async () => {
    const started = Date.now();
    const result = await runSandboxed(["/bin/sh", "-c", "sleep 5"], {
      cwd: CWD,
      timeoutMs: 300,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
  });

  test("output dipotong pada maxOutputBytes tanpa menggantung proses", async () => {
    const result = await runSandboxed(
      ["/bin/sh", "-c", "head -c 1000000 /dev/zero | tr '\\0' 'a'"],
      { cwd: CWD, timeoutMs: 10_000, maxOutputBytes: 10_000 },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.length).toBeLessThanOrEqual(10_000);
  });

  test("env induk tidak bocor; hanya env eksplisit yang terlihat", async () => {
    process.env.AQSHA_RUNNER_LEAK_PROBE = "bocor";
    try {
      const result = await runSandboxed(
        ["/bin/sh", "-c", 'echo "[$AQSHA_RUNNER_LEAK_PROBE][$EXPLICIT]"'],
        { cwd: CWD, timeoutMs: 5000, env: { EXPLICIT: "ada" } },
      );
      expect(result.stdout.trim()).toBe("[][ada]");
    } finally {
      delete process.env.AQSHA_RUNNER_LEAK_PROBE;
    }
  });

  test("maxMemoryKb membungkus perintah tanpa merusaknya (cap efektif hanya Linux)", async () => {
    const result = await runSandboxed(["/bin/echo", "ok"], {
      cwd: CWD,
      timeoutMs: 5000,
      maxMemoryKb: 2_097_152,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("ok");
  });
});
