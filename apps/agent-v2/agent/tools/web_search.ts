import { disableTool } from "eve/tools";

/**
 * SATU-SATUNYA built-in eve yang sengaja tetap dimatikan.
 *
 * `web_search` bawaan eve adalah tool web-search NATIVE PROVIDER (skema output OpenAI/
 * Anthropic/Google/Gateway) — bukan fetch host biasa. Astra memakai model via OpenRouter
 * (`deepseek/...`) yang tak menjamin dukungan native web-search, dan kita sudah punya
 * `search_web` (Firecrawl, in-process). Dua tool pencarian web = membingungkan model +
 * jalur yang tak andal. Jadi tetap matikan; pencarian web lewat `search_web`.
 *
 * Catatan: built-in filesystem (`bash`/`glob`/`grep`/`write_file`/`read_file`) dan `web_fetch`
 * (fetch URL host-side) SUDAH di-AKTIFKAN kembali (stub disable dihapus) sejak sandbox
 * `justbash` dipasang — lihat `agent/sandbox.ts`.
 */
export default disableTool();
