import { env } from '$env/dynamic/public';
import { applyPublicDefaults, type PublicEnv } from './defaults';

/**
 * Env PUBLIC bertipe untuk client+server, dibaca `$env/dynamic/public` (§3.7 — runtime, Infisical).
 * TANPA zod di client bundle: validasi keras (fail-fast) sudah dijalankan di boot server via
 * `$lib/server/env` (zod), dan SvelteKit menyajikan nilai PUBLIC yang sama ke client. Feature code &
 * config membaca `publicEnv.*` alih-alih `$env/dynamic/public` langsung agar bertipe + berdefault.
 */
export const publicEnv: PublicEnv = applyPublicDefaults(env);
