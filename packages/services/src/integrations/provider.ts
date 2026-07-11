import type { IntegrationProfile, IntegrationProvider } from "@aqsha/db";
import type { CslItem } from "../citations/citation-normalize";

export type { IntegrationProfile, IntegrationProvider };

/** Folder/collection provider untuk picker penarikan. */
export type ProviderFolder = {
  id: string;
  name: string;
  parentId?: string | null;
};

/** Satu dokumen provider ternormalisasi ke CSL-JSON + id provider (idempotensi). */
export type ProviderDocument = {
  externalId: string;
  csl: CslItem;
};

/** Credential plaintext Mendeley (OAuth). Disimpan terenkripsi via `crypto.ts`. */
export type MendeleyCredentials = {
  provider: "mendeley";
  accessToken: string;
  refreshToken: string;
  /** epoch ms; access token diperbarui bila mendekati/melewati ini. */
  expiresAt: number;
};

/** Credential plaintext Zotero (API key) — Fase 6. */
export type ZoteroCredentials = {
  provider: "zotero";
  apiKey: string;
  userId: string;
};

export type ProviderCredentials = MendeleyCredentials | ZoteroCredentials;

/**
 * Adapter satu provider referensi di balik interface generik (multi-provider).
 * Lifecycle koneksi (persist/enkripsi/status) ada di `IntegrationService`; adapter
 * hanya bicara protokol provider. Semua IO bersifat best-effort: lempar `AppError`
 * terstruktur agar route memetakan ke HTTP.
 *
 * Dua mode connect: `oauth` (Mendeley — authorize redirect + exchange code) dan
 * `api_key` (Zotero — user menempel API key + user id, tanpa OAuth dance). Field
 * per-mode bersifat opsional; `IntegrationService` memilih berdasarkan `authMode`.
 */
export interface IntegrationAdapter {
  readonly provider: IntegrationProvider;
  /** Cara connect: OAuth redirect (Mendeley) atau API key manual (Zotero). */
  readonly authMode: "oauth" | "api_key";
  /** Server siap (env + crypto) → connect boleh ditawarkan di UI. */
  isConfigured(): boolean;
  /** OAuth-only: bangun URL authorize (redirect browser). */
  buildAuthorizeUrl?(input: { state: string; redirectUri: string }): string;
  /** OAuth-only: tukar authorization code → credential (backend-only). */
  exchangeCode?(input: { code: string; redirectUri: string }): Promise<ProviderCredentials>;
  /** API-key-only: validasi key/user id ke provider → credential (backend-only). */
  connectWithApiKey?(input: { apiKey: string; userId?: string }): Promise<ProviderCredentials>;
  /**
   * Pastikan credential masih valid; refresh bila perlu. `refreshed=true` → caller
   * WAJIB persist ulang credential baru. No-op untuk provider tanpa expiry (Zotero).
   */
  ensureFresh(
    creds: ProviderCredentials,
  ): Promise<{ creds: ProviderCredentials; refreshed: boolean }>;
  /** Profil akun (nama/email) untuk ditampilkan di Settings. */
  fetchProfile(creds: ProviderCredentials): Promise<IntegrationProfile>;
  /** Daftar folder/collection untuk picker. */
  listFolders(creds: ProviderCredentials): Promise<ProviderFolder[]>;
  /** Tarik dokumen (satu folder, atau semua bila `folderId` null). */
  pullDocuments(
    creds: ProviderCredentials,
    input: { folderId: string | null },
  ): Promise<ProviderDocument[]>;
  /** Best-effort revoke token saat disconnect (opsional). */
  revoke?(creds: ProviderCredentials): Promise<void>;
}
