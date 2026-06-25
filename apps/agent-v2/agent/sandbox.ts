import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

/**
 * Sandbox Astra — DI-PIN ke `justbash()` secara eksplisit (BUKAN default eve).
 *
 * KENAPA WAJIB ADA: tool framework `load_skill` eve MEMBACA body SKILL.md dari
 * filesystem sandbox saat runtime (`loadSkillFromSandbox`). Tanpa sandbox, `load_skill`
 * MELEMPAR "requires sandbox access" → metodologi `deep-research` (+ semua domain-pack)
 * tak pernah termuat → /deep jalan degraded tanpa delegasi subagent.
 *
 * KENAPA `justbash` (bukan default): `defaultBackend()` memilih microsandbox di
 * macOS Apple Silicon TANPA cek apakah runtime VM-nya terpasang (`isMicrosandboxPlatformSupported`
 * return true unconditionally di darwin/arm64). Mesin tanpa Docker + tanpa msb → eve
 * coba boot microVM yang tak ada → provisioning menggantung bermenit-menit → /deep "loading
 * tak berhenti". justbash = interpreter bash murni-JS (VFS di `.eve/sandbox-cache/`), TANPA
 * daemon/VM/jaringan — instan, nol infra, jalan sama di dev (Mac) maupun prod (VPS Linux).
 *
 * CUKUP karena Astra TIDAK butuh eksekusi binary nyata: tool web/riset (search_web/papers/
 * arxiv/lookup_doi) jalan in-process via @aqsha/services, bukan lewat shell sandbox. Sandbox
 * di sini cuma untuk hosting + baca file skill (dan scratchpad file opsional via bash/write_file).
 * Naikkan ke `docker()` HANYA bila nanti agent perlu menjalankan binary sungguhan (git/python/dst).
 */
export default defineSandbox({ backend: justbash() });
