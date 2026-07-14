// Integration contract from @aqsha/api (IntegrationService). apps/svelte does not
// import services — types mirrored manually (same pattern as features/citations/types).
// Port 1:1 from apps/web/features/settings/lib/integrations.ts.

export type IntegrationProviderKey = 'mendeley' | 'zotero';

export type IntegrationConnectionStatus =
	'connected' | 'expired' | 'error' | 'revoked' | 'disconnected';

/** How a provider is connected: OAuth redirect (Mendeley) or API key (Zotero). */
export type IntegrationAuthMode = 'oauth' | 'api_key';

export type IntegrationStatusView = {
	provider: IntegrationProviderKey;
	/** Adapter implemented (Mendeley + Zotero live). */
	available: boolean;
	/** How to connect this provider (drives the Hubungkan button UX). */
	authMode: IntegrationAuthMode;
	/** Server configured (client id/secret + enc key) → connect button active. */
	configured: boolean;
	status: IntegrationConnectionStatus;
	profile: { id?: string; name?: string; email?: string } | null;
	selectedFolders: string[];
	lastSyncAt: number | null;
	lastError: string | null;
	connectedAt: number | null;
};

/** Fallback authMode per provider (used before server status resolves). */
export const PROVIDER_AUTH_MODE: Record<IntegrationProviderKey, IntegrationAuthMode> = {
	mendeley: 'oauth',
	zotero: 'api_key'
};

export const PROVIDER_META: Record<
	IntegrationProviderKey,
	{ label: string; description: string; helpUrl: string }
> = {
	mendeley: {
		label: 'Mendeley',
		description: 'Tarik metadata referensi dari koleksi Mendeley ke workspace.',
		helpUrl: 'https://www.mendeley.com/'
	},
	zotero: {
		label: 'Zotero',
		description: 'Tarik metadata referensi dari koleksi Zotero ke workspace.',
		helpUrl: 'https://www.zotero.org/settings/keys'
	}
};

export const INTEGRATION_STATUS_LABELS: Record<IntegrationConnectionStatus, string> = {
	connected: 'Terhubung',
	expired: 'Kedaluwarsa',
	error: 'Error',
	revoked: 'Dicabut',
	disconnected: 'Tidak terhubung'
};

/** Callback result messages (query `?connected=` / `?error=`). */
export const INTEGRATION_ERROR_MESSAGES: Record<string, string> = {
	missing_code: 'Kode otorisasi tidak diterima dari provider.',
	integration_state_invalid: 'Sesi koneksi tidak valid, coba lagi.',
	integration_state_expired: 'Sesi koneksi kedaluwarsa, coba hubungkan ulang.',
	integration_provider_error: 'Provider menolak permintaan. Coba lagi nanti.',
	connect_failed: 'Koneksi gagal. Coba lagi.'
};
