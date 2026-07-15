import { env as privateEnvRaw } from '$env/dynamic/private';
import { env as publicEnvRaw } from '$env/dynamic/public';
import { parsePrivateEnv, parsePublicEnv, type PrivateEnv } from '$lib/env/schema';

/**
 * Env PRIVATE tervalidasi (server-only). Berada di `$lib/server` → SvelteKit MEMBLOKIR impor
 * dari client (compile error), jadi rahasia (CLERK_SECRET_KEY, DSN) tak pernah bocor ke bundle.
 *
 * BOOT VALIDATION fail-fast: modul ini diimpor pertama kali oleh `hooks.server.ts` saat server start.
 * `parsePublicEnv` + `parsePrivateEnv` (zod) memvalidasi SEMUA env di sini; env salah → throw
 * `ZodError` saat boot (bukan error senyap saat request). Nilai dibaca `$env/dynamic/*` (runtime,
 * Infisical), bukan `$env/static/*` (di-bake build → basi di prod).
 */
parsePublicEnv(publicEnvRaw); // validasi PUBLIC_* di boot (nilai bertipe diekspos client via $lib/env/public)

export const serverEnv: PrivateEnv = parsePrivateEnv(privateEnvRaw);
