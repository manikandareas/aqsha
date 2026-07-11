import { resolve } from "node:path";
import { Image } from "@daytona/sdk";
import { getDaytona } from "../src/clients/daytona";
import { loadDaytonaEnvFallback } from "./load-daytona-env";

loadDaytonaEnvFallback();

/**
 * Build + push snapshot Daytona versioned untuk sandbox statistik.
 * Jalankan: `bun run stats:snapshot [nama] [--replace]` (default nama dari
 * AQSHA_DAYTONA_SNAPSHOT, fallback `aqsha-stats-v1`). Butuh DAYTONA_API_KEY.
 * Image = packages/stats-py/Dockerfile (python 3.12-slim + stack stats + package
 * `aqsha_stats`, versi di-pin dari uv.lock). Resources di snapshot = default sandbox
 * yang dibuat darinya (create-from-snapshot tak menerima resources). Snapshot inactive
 * setelah 2 minggu tak dipakai → re-run saat deploy.
 *
 * Nama snapshot UNIK per organisasi: `create` menolak (409) bila sudah ada. Saat
 * mengubah Dockerfile, naikkan versi (mis. `aqsha-stats-v2` lalu update kedua
 * AQSHA_DAYTONA_SNAPSHOT) ATAU pakai `--replace` untuk hapus-lalu-rebuild nama sama.
 */
const args = process.argv.slice(2);
const replace = args.includes("--replace");
const name =
  args.find((a) => !a.startsWith("--")) ?? process.env.AQSHA_DAYTONA_SNAPSHOT ?? "aqsha-stats-v1";
const dockerfile = resolve(import.meta.dir, "../../stats-py/Dockerfile");

function errMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const daytona = getDaytona();

  if (replace) {
    // Hapus snapshot lama (kalau ada) supaya rebuild nama yang sama tidak 409.
    try {
      const existing = await daytona.snapshot.get(name);
      console.log(`[stats:snapshot] --replace: hapus snapshot lama "${name}"…`);
      await daytona.snapshot.delete(existing);
    } catch (error) {
      // Belum ada → lanjut create; error lain (auth/jaringan) muncul lagi di create.
      console.log(`[stats:snapshot] tidak ada snapshot lama untuk dihapus (${errMessage(error)}).`);
    }
  }

  console.log(`[stats:snapshot] build snapshot "${name}" dari ${dockerfile}`);
  await daytona.snapshot.create(
    {
      name,
      image: Image.fromDockerfile(dockerfile),
      resources: { cpu: 1, memory: 2, disk: 3 },
    },
    { onLogs: (line) => console.log(line) },
  );
  console.log(
    `[stats:snapshot] selesai — snapshot "${name}" siap dipakai (set AQSHA_DAYTONA_SNAPSHOT=${name})`,
  );
}

try {
  await main();
} catch (error) {
  const message = errMessage(error);
  console.error(`[stats:snapshot] GAGAL: ${message}`);
  if (/already exists/i.test(message)) {
    console.error(
      `[stats:snapshot] Snapshot "${name}" sudah ada. Naikkan versi ` +
        `(mis. bun run stats:snapshot aqsha-stats-v2, lalu update AQSHA_DAYTONA_SNAPSHOT ` +
        `di apps/agent/.env + apps/api/.env) ATAU rebuild nama sama: ` +
        `bun run stats:snapshot ${name} --replace`,
    );
  }
  process.exit(1);
}
