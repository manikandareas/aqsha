import { createStatsSandbox, deleteSandbox } from "../src/clients/daytona";
import { loadDaytonaEnvFallback } from "./load-daytona-env";

loadDaytonaEnvFallback();

/**
 * Smoke test infra sandbox statistik (BUKAN test CI — butuh DAYTONA_API_KEY +
 * snapshot hidup). Jalankan: `bun run stats:smoke`. Memverifikasi acceptance fase 0:
 * create-dari-snapshot cepat, upload CSV, `python -m aqsha_stats run profile` →
 * stdout JSON valid, chart matplotlib tertangkap sebagai artifact PNG, dan
 * networkBlockAll benar-benar memblokir egress. Sandbox dihapus di akhir.
 */
const CSV = [
  "X1.1,X1.2,X1.3,Y.1,Y.2",
  ...Array.from({ length: 30 }, (_, i) => {
    const v = (k: number) => ((i * 7 + k * 3) % 5) + 1;
    return [v(1), v(2), v(3), v(4), v(5)].join(",");
  }),
].join("\n");

function fail(step: string, detail: string): never {
  console.error(`[stats:smoke] GAGAL pada ${step}: ${detail}`);
  process.exit(1);
}

console.log("[stats:smoke] create sandbox dari snapshot…");
const t0 = Date.now();
const sandbox = await createStatsSandbox({ "aqsha.purpose": "smoke" });
const createMs = Date.now() - t0;
console.log(`[stats:smoke] sandbox ${sandbox.id} dibuat dalam ${createMs} ms`);

try {
  await sandbox.fs.uploadFile(Buffer.from(CSV, "utf8"), "/home/daytona/datasets/smoke.csv");
  console.log("[stats:smoke] dataset ter-upload");

  // 1. Profil via CLI aqsha_stats → stdout JSON terstruktur.
  const profile = await sandbox.process.codeRun(
    [
      "import subprocess, sys",
      "proc = subprocess.run([sys.executable, '-m', 'aqsha_stats', 'run', 'profile', '--data', '/home/daytona/datasets/smoke.csv', '--args', '{}'], capture_output=True, text=True)",
      "print(proc.stdout)",
    ].join("\n"),
    undefined,
    120,
  );
  if (profile.exitCode !== 0) fail("profile", profile.result);
  const parsed = JSON.parse(profile.artifacts?.stdout ?? profile.result);
  if (parsed.analysis !== "profile" || !Array.isArray(parsed.tables)) {
    fail("profile", `JSON tak sesuai kontrak: ${JSON.stringify(parsed).slice(0, 200)}`);
  }
  console.log(`[stats:smoke] profile OK (n=${parsed.meta?.n})`);

  // 2. Chart capture: plt.show() → artifacts.charts[] berisi PNG base64.
  const chart = await sandbox.process.codeRun(
    [
      "import matplotlib",
      "import matplotlib.pyplot as plt",
      "plt.plot([1, 2, 3], [2, 4, 8])",
      "plt.title('smoke')",
      "plt.show()",
    ].join("\n"),
    undefined,
    120,
  );
  const png = chart.artifacts?.charts?.[0]?.png;
  if (!png) fail("chart", `charts kosong (exit ${chart.exitCode}): ${chart.result.slice(0, 200)}`);
  Buffer.from(png, "base64"); // decode-able
  console.log(`[stats:smoke] chart PNG ter-decode (${png.length} chars base64)`);

  // 3. networkBlockAll: fetch keluar HARUS gagal.
  const egress = await sandbox.process.codeRun(
    [
      "import urllib.request",
      "try:",
      "    urllib.request.urlopen('https://example.com', timeout=5)",
      "    print('EGRESS_OK')",
      "except Exception as e:",
      "    print('EGRESS_BLOCKED')",
    ].join("\n"),
    undefined,
    60,
  );
  if (!(egress.artifacts?.stdout ?? egress.result).includes("EGRESS_BLOCKED")) {
    fail("networkBlockAll", "egress TIDAK terblokir — cek konfigurasi sandbox");
  }
  console.log("[stats:smoke] egress terblokir (networkBlockAll bekerja)");

  console.log(
    `[stats:smoke] PASS — create ${createMs} ms${createMs > 5000 ? " (PERHATIAN: > 5 dtk dari acceptance)" : ""}`,
  );
} finally {
  await deleteSandbox(sandbox.id);
  console.log("[stats:smoke] sandbox dihapus");
}
