import type { ComposerNotice } from '$lib/features/threads/components/composer';

/**
 * Send-status → composer notice / `/deep` block message (THX-7). Send-status is a RETURN UNION from the
 * non-consuming pre-check (`GET /threads/send-status`), NOT a thrown error: `{ canSend, reason?, retryAt? }`.
 * The authoritative backstop is the server billing precheck; these map the reason to UX copy. Ported
 * from the helpers in `mastra-chat-thread-surface.tsx`.
 */
export type SendStatus = {
	canSend: boolean;
	reason?: string;
	retryAt?: number;
};

/** Blocked send-status → composer notice (billing return-union / cooldown). `null` when send is allowed. */
export function blockedNotice(status: SendStatus | undefined): ComposerNotice | null {
	if (!status || status.canSend) return null;
	switch (status.reason) {
		case 'cooldown':
			return {
				message: 'Terlalu cepat. Tunggu sebentar sebelum mengirim lagi.',
				retryAt: status.retryAt
			};
		case 'quota_exceeded':
			return { message: 'Kredit chat bulan ini sudah habis. Tingkatkan paket atau tunggu reset.' };
		case 'subscription_required':
			return { message: 'Fitur ini butuh paket berbayar. Tingkatkan paket untuk melanjutkan.' };
		case 'billing_inactive':
			return { message: 'Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan.' };
		default:
			return { message: 'Pengiriman sedang tidak tersedia.' };
	}
}

/**
 * `/deep` pre-check block message (feature `deep_research`) — used as a toast on submit (FE-11): a user
 * out of `/deep` cap must know BEFORE the Workflow runs, not fail mid-run.
 */
export function deepBlockedMessage(status: SendStatus | undefined): string {
	if (!status || status.canSend) return 'Riset mendalam sedang tidak tersedia.';
	switch (status.reason) {
		case 'cooldown':
			return 'Terlalu cepat. Tunggu sebentar sebelum menjalankan /deep lagi.';
		case 'quota_exceeded':
			return 'Kuota riset mendalam (/deep) bulan ini sudah habis. Tingkatkan paket atau tunggu reset.';
		case 'subscription_required':
			return 'Riset mendalam butuh paket berbayar. Tingkatkan paket untuk melanjutkan.';
		case 'billing_inactive':
			return 'Langganan tidak aktif. Perbarui pembayaran untuk melanjutkan.';
		default:
			return 'Riset mendalam sedang tidak tersedia.';
	}
}
