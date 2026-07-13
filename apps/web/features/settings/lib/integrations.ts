// Kontrak integrasi dari @aqsha/api (IntegrationService). apps/web tidak meng-import
// services — tipe dicermin manual (pola sama dengan features/citations/types).

export type IntegrationProviderKey = "mendeley" | "zotero";

export type IntegrationConnectionStatus =
  | "connected"
  | "expired"
  | "error"
  | "revoked"
  | "disconnected";

/** Cara menghubungkan provider: OAuth redirect (Mendeley) atau API key (Zotero). */
export type IntegrationAuthMode = "oauth" | "api_key";

export type IntegrationStatusView = {
  provider: IntegrationProviderKey;
  /** Adapter terimplementasi (Mendeley + Zotero live). */
  available: boolean;
  /** Cara connect provider ini (menentukan UX tombol Hubungkan). */
  authMode: IntegrationAuthMode;
  /** Server terkonfigurasi (client id/secret + enc key) → tombol connect aktif. */
  configured: boolean;
  status: IntegrationConnectionStatus;
  profile: { id?: string; name?: string; email?: string } | null;
  selectedFolders: string[];
  lastSyncAt: number | null;
  lastError: string | null;
  connectedAt: number | null;
};

/** Fallback authMode per provider (dipakai saat status server belum termuat). */
export const PROVIDER_AUTH_MODE: Record<IntegrationProviderKey, IntegrationAuthMode> = {
  mendeley: "oauth",
  zotero: "api_key",
};

export const PROVIDER_META: Record<
  IntegrationProviderKey,
  { label: string; description: string; helpUrl: string }
> = {
  mendeley: {
    label: "Mendeley",
    description: "Tarik metadata referensi dari koleksi Mendeley ke workspace.",
    helpUrl: "https://www.mendeley.com/",
  },
  zotero: {
    label: "Zotero",
    description: "Tarik metadata referensi dari koleksi Zotero ke workspace.",
    helpUrl: "https://www.zotero.org/settings/keys",
  },
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationConnectionStatus, string> = {
  connected: "Terhubung",
  expired: "Kedaluwarsa",
  error: "Error",
  revoked: "Dicabut",
  disconnected: "Tidak terhubung",
};

/** Pesan hasil callback OAuth (query `?connected=` / `?error=`). */
export const INTEGRATION_ERROR_MESSAGES: Record<string, string> = {
  missing_code: "Kode otorisasi tidak diterima dari provider.",
  integration_state_invalid: "Sesi koneksi tidak valid, coba lagi.",
  integration_state_expired: "Sesi koneksi kedaluwarsa, coba hubungkan ulang.",
  integration_provider_error: "Provider menolak permintaan. Coba lagi nanti.",
  connect_failed: "Koneksi gagal. Coba lagi.",
};
