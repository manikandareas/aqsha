import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

/**
 * Pin justbash, sama seperti root (lihat `agent/sandbox.ts` untuk alasan lengkap).
 * Subagent ini agen pencari murni (tools riset in-process), tak punya skill — tapi
 * built-in `bash`/`read_file`/dst. tetap terekspos. Tanpa pin ini, satu pemanggilan
 * built-in sandbox akan jatuh ke microsandbox default → hang di darwin/arm64. justbash =
 * instan, nol infra, jaring pengaman bila model menyentuh filesystem.
 */
export default defineSandbox({ backend: justbash() });
