import type {
  DbOrTx,
  IntegrationConnection,
  IntegrationProfile,
  IntegrationProvider,
  IntegrationStatus,
} from "@aqsha/db";
import { AppError, IntegrationConnectionRepo } from "@aqsha/db";
import { decryptCredentials, encryptCredentials, isIntegrationCryptoConfigured } from "./crypto";
import { mendeleyAdapter } from "./mendeley.adapter";
import { signOAuthState, verifyOAuthState } from "./oauth-state";
import type {
  IntegrationAdapter,
  ProviderCredentials,
  ProviderDocument,
  ProviderFolder,
} from "./provider";
import { zoteroAdapter } from "./zotero.adapter";

/** Provider yang punya kartu di Settings (adapter bisa belum tersedia = "Segera"). */
export const KNOWN_PROVIDERS: IntegrationProvider[] = ["mendeley", "zotero"];

/** Registry adapter — Mendeley (OAuth) + Zotero (API key). */
const ADAPTERS: Partial<Record<IntegrationProvider, IntegrationAdapter>> = {
  mendeley: mendeleyAdapter,
  zotero: zoteroAdapter,
};

export type IntegrationStatusView = {
  provider: IntegrationProvider;
  /** Adapter terimplementasi (Mendeley + Zotero live; provider baru bisa "Segera"). */
  available: boolean;
  /** Cara connect: OAuth redirect (Mendeley) atau API key manual (Zotero). */
  authMode: "oauth" | "api_key";
  /** Env client id/secret + enc key lengkap → tombol connect boleh aktif. */
  configured: boolean;
  status: IntegrationStatus | "disconnected";
  profile: IntegrationProfile | null;
  selectedFolders: string[];
  lastSyncAt: number | null;
  lastError: string | null;
  connectedAt: number | null;
};

function adapterFor(provider: IntegrationProvider): IntegrationAdapter {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    throw new AppError({
      code: "integration_provider_unavailable",
      message: "Integrasi provider ini belum tersedia.",
      severity: "warning",
      status: 400,
    });
  }
  return adapter;
}

/** Redirect URI OAuth — HARUS sama persis dengan yang didaftarkan di provider. */
function redirectUriFor(provider: IntegrationProvider): string {
  const explicit = process.env[`${provider.toUpperCase()}_REDIRECT_URI`]?.trim();
  if (explicit) return explicit;
  const apiBase = process.env.AQSHA_PUBLIC_API_URL?.trim();
  if (!apiBase) {
    throw new AppError({
      code: "integration_not_configured",
      message: `Redirect URI ${provider} belum dikonfigurasi (set AQSHA_PUBLIC_API_URL atau ${provider.toUpperCase()}_REDIRECT_URI).`,
      severity: "error",
      status: 500,
    });
  }
  return `${apiBase.replace(/\/+$/, "")}/integrations/${provider}/callback`;
}

function toStatusView(
  provider: IntegrationProvider,
  connection: IntegrationConnection | null,
): IntegrationStatusView {
  const adapter = ADAPTERS[provider];
  const available = Boolean(adapter);
  const configured = available && isIntegrationCryptoConfigured() && Boolean(adapter?.isConfigured());
  return {
    provider,
    available,
    authMode: adapter?.authMode ?? "oauth",
    configured,
    status: connection ? (connection.status as IntegrationStatus) : "disconnected",
    profile: connection?.externalProfileJson ?? null,
    selectedFolders: connection?.selectedFoldersJson ?? [],
    lastSyncAt: connection?.lastSyncAt ?? null,
    lastError: connection?.lastError ?? null,
    connectedAt: connection?.createdAt ?? null,
  };
}

/**
 * Enkripsi + upsert credential koneksi (satu baris per owner+provider). Dipakai
 * kedua jalur connect: OAuth callback (Mendeley) dan API key (Zotero). Profil
 * best-effort; koneksi tetap tersimpan meski fetch profil gagal.
 */
async function persistConnection(
  db: DbOrTx,
  input: {
    ownerUserId: string;
    provider: IntegrationProvider;
    creds: ProviderCredentials;
    profile: IntegrationProfile | null;
  },
): Promise<void> {
  const { ownerUserId, provider, creds, profile } = input;
  const encrypted = encryptCredentials(creds);
  const tokenExpiresAt = creds.provider === "mendeley" ? creds.expiresAt : null;
  const now = Date.now();
  await IntegrationConnectionRepo.upsert(
    db,
    {
      id: crypto.randomUUID(),
      ownerUserId,
      provider,
      credentialsEncrypted: encrypted,
      tokenExpiresAt,
      externalProfileJson: profile,
      selectedFoldersJson: [],
      status: "connected",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      credentialsEncrypted: encrypted,
      tokenExpiresAt,
      externalProfileJson: profile,
      status: "connected",
      lastError: null,
      updatedAt: now,
    },
  );
}

/**
 * Lifecycle koneksi akun ke aplikasi referensi (account-level). Credential
 * dienkripsi at-rest (`crypto.ts`) dan TAK PERNAH keluar dari service. Penarikan
 * data ke perpustakaan akun ada di `CitationSyncService`.
 */
export const IntegrationService = {
  /** Status semua provider (untuk Settings) — tanpa credential apa pun. */
  async listStatuses(db: DbOrTx, ownerUserId: string): Promise<IntegrationStatusView[]> {
    const connections = await IntegrationConnectionRepo.listByOwner(db, ownerUserId);
    const byProvider = new Map(connections.map((c) => [c.provider as IntegrationProvider, c]));
    return KNOWN_PROVIDERS.map((provider) => toStatusView(provider, byProvider.get(provider) ?? null));
  },

  /** Mulai OAuth: kembalikan URL authorize (browser di-redirect ke sini). */
  startConnect(ownerUserId: string, provider: IntegrationProvider): { url: string } {
    const adapter = adapterFor(provider);
    if (adapter.authMode !== "oauth" || !adapter.buildAuthorizeUrl) {
      throw new AppError({
        code: "integration_connect_mode_mismatch",
        message: "Provider ini terhubung lewat API key, bukan OAuth.",
        severity: "warning",
        status: 400,
      });
    }
    if (!isIntegrationCryptoConfigured() || !adapter.isConfigured()) {
      throw new AppError({
        code: "integration_not_configured",
        message: "Integrasi provider belum dikonfigurasi di server.",
        severity: "error",
        status: 500,
      });
    }
    const state = signOAuthState({ ownerUserId, provider });
    const url = adapter.buildAuthorizeUrl({ state, redirectUri: redirectUriFor(provider) });
    return { url };
  },

  /**
   * Connect via API key (Zotero): validasi key/user id ke provider, enkripsi +
   * persist. Tanpa OAuth dance — dipanggil langsung dari route ber-bearer Clerk
   * (identitas = `ownerUserId`, bukan signed state). Mengembalikan status baru.
   */
  async connectWithApiKey(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
    input: { apiKey: string; userId?: string },
  ): Promise<IntegrationStatusView> {
    const adapter = adapterFor(provider);
    if (adapter.authMode !== "api_key" || !adapter.connectWithApiKey) {
      throw new AppError({
        code: "integration_connect_mode_mismatch",
        message: "Provider ini terhubung lewat OAuth, bukan API key.",
        severity: "warning",
        status: 400,
      });
    }
    if (!isIntegrationCryptoConfigured()) {
      throw new AppError({
        code: "integration_not_configured",
        message: "Integrasi provider belum dikonfigurasi di server.",
        severity: "error",
        status: 500,
      });
    }
    const creds = await adapter.connectWithApiKey(input);
    let profile: IntegrationProfile | null = null;
    try {
      profile = await adapter.fetchProfile(creds);
    } catch {
      profile = null; // profil best-effort; koneksi tetap tersimpan
    }
    await persistConnection(db, { ownerUserId, provider, creds, profile });
    const updated = await IntegrationConnectionRepo.findByProvider(db, ownerUserId, provider);
    return toStatusView(provider, updated ?? null);
  },

  /**
   * Selesaikan OAuth callback: verifikasi state, tukar code, enkripsi + persist.
   * Dipanggil dari route callback (browser) — route yang menangani redirect balik.
   */
  async completeOAuth(
    db: DbOrTx,
    input: { provider: IntegrationProvider; code: string; state: string },
  ): Promise<{ ownerUserId: string }> {
    const state = verifyOAuthState(input.state);
    if (state.provider !== input.provider) {
      throw new AppError({
        code: "integration_state_invalid",
        message: "State OAuth tidak cocok dengan provider.",
        severity: "warning",
        status: 400,
      });
    }
    const adapter = adapterFor(input.provider);
    if (adapter.authMode !== "oauth" || !adapter.exchangeCode) {
      throw new AppError({
        code: "integration_connect_mode_mismatch",
        message: "Provider ini tidak memakai alur OAuth.",
        severity: "warning",
        status: 400,
      });
    }
    const creds = await adapter.exchangeCode({
      code: input.code,
      redirectUri: redirectUriFor(input.provider),
    });
    let profile: IntegrationProfile | null = null;
    try {
      profile = await adapter.fetchProfile(creds);
    } catch {
      profile = null; // profil best-effort; koneksi tetap tersimpan
    }
    await persistConnection(db, {
      ownerUserId: state.ownerUserId,
      provider: input.provider,
      creds,
      profile,
    });
    return { ownerUserId: state.ownerUserId };
  },

  /** Putuskan koneksi: revoke best-effort + hapus credential lokal. Data citation utuh. */
  async disconnect(db: DbOrTx, ownerUserId: string, provider: IntegrationProvider): Promise<void> {
    const connection = await IntegrationConnectionRepo.findByProvider(db, ownerUserId, provider);
    if (!connection) return;
    const adapter = ADAPTERS[provider];
    if (adapter?.revoke) {
      try {
        adapter.revoke(decryptCredentials<ProviderCredentials>(connection.credentialsEncrypted));
      } catch {
        // revoke best-effort — tetap hapus credential lokal.
      }
    }
    await IntegrationConnectionRepo.deleteByProvider(db, ownerUserId, provider);
  },

  /**
   * Credential valid (decrypt + refresh bila perlu, re-persist bila refreshed).
   * Dipakai internal + `CitationSyncService`. Refresh gagal → tandai koneksi expired.
   */
  async getValidCredentials(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
  ): Promise<{ connection: IntegrationConnection; creds: ProviderCredentials }> {
    const connection = await IntegrationConnectionRepo.findByProvider(db, ownerUserId, provider);
    if (!connection) {
      throw new AppError({
        code: "integration_not_connected",
        message: "Akun provider belum terhubung.",
        severity: "warning",
        status: 400,
      });
    }
    const adapter = adapterFor(provider);
    const stored = decryptCredentials<ProviderCredentials>(connection.credentialsEncrypted);
    let creds = stored;
    try {
      const fresh = await adapter.ensureFresh(stored);
      creds = fresh.creds;
      if (fresh.refreshed) {
        const now = Date.now();
        await IntegrationConnectionRepo.updateById(db, connection.id, {
          credentialsEncrypted: encryptCredentials(creds),
          tokenExpiresAt: creds.provider === "mendeley" ? creds.expiresAt : null,
          status: "connected",
          lastError: null,
          updatedAt: now,
        });
      }
    } catch (error) {
      await IntegrationConnectionRepo.updateById(db, connection.id, {
        status: "expired",
        lastError: error instanceof Error ? error.message.slice(0, 500) : "refresh gagal",
        updatedAt: Date.now(),
      });
      throw new AppError({
        code: "integration_expired",
        message: "Koneksi provider kedaluwarsa — hubungkan ulang di Pengaturan → Integrasi.",
        severity: "warning",
        status: 400,
      });
    }
    return { connection, creds };
  },

  /** Daftar folder/collection untuk picker penarikan. */
  async listFolders(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
  ): Promise<ProviderFolder[]> {
    const { creds } = await this.getValidCredentials(db, ownerUserId, provider);
    return adapterFor(provider).listFolders(creds);
  },

  /** Tarik dokumen provider (dipakai `CitationSyncService`). */
  async pullDocuments(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
    folderId: string | null,
  ): Promise<{ connection: IntegrationConnection; documents: ProviderDocument[] }> {
    const { connection, creds } = await this.getValidCredentials(db, ownerUserId, provider);
    const documents = await adapterFor(provider).pullDocuments(creds, { folderId });
    return { connection, documents };
  },

  /** Tandai waktu sync terakhir + folder terpilih setelah preview/commit sukses. */
  async touchSync(
    db: DbOrTx,
    connectionId: string,
    input: { folderId: string | null },
  ): Promise<void> {
    const now = Date.now();
    await IntegrationConnectionRepo.updateById(db, connectionId, {
      lastSyncAt: now,
      selectedFoldersJson: input.folderId ? [input.folderId] : [],
      updatedAt: now,
    });
  },

  /**
   * Refresh kesehatan koneksi (token + profil) + stempel `last_sync_at`. Dipakai
   * tombol "Sinkronkan sekarang" (sinkron) DAN worker `integration-sync` (periodik
   * opt-in). Idempotent; tidak menyentuh library citation.
   */
  async refreshConnection(
    db: DbOrTx,
    ownerUserId: string,
    provider: IntegrationProvider,
  ): Promise<IntegrationStatusView> {
    const { connection, creds } = await this.getValidCredentials(db, ownerUserId, provider);
    let profile = connection.externalProfileJson ?? null;
    try {
      profile = await adapterFor(provider).fetchProfile(creds);
    } catch {
      // profil best-effort — pertahankan yang lama.
    }
    const now = Date.now();
    await IntegrationConnectionRepo.updateById(db, connection.id, {
      externalProfileJson: profile,
      lastSyncAt: now,
      status: "connected",
      lastError: null,
      updatedAt: now,
    });
    const updated = await IntegrationConnectionRepo.findByProvider(db, ownerUserId, provider);
    return toStatusView(provider, updated ?? null);
  },
};
