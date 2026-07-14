// Settings navigation model — port 1:1 from
// apps/web/features/settings/lib/settings-menu.ts. Icons are Hugeicons glyph DATA
// (`IconSvgElement`) rather than React components (§Phase 3 icon adapter).

import {
	CreditCardIcon,
	GaugeIcon,
	type IconSvgElement,
	PaletteIcon,
	PlugIcon,
	ShieldIcon,
	SparklesIcon,
	UserRoundIcon
} from '$lib/icons';

export type SettingsKey =
	| 'overview'
	| 'account'
	| 'appearance'
	| 'personalization'
	| 'usage-billing'
	| 'security'
	| 'integrations';

export type SettingsMenuItem = {
	key: SettingsKey;
	href: string;
	label: string;
	description: string;
	group: 'Pribadi' | 'Riset';
	icon: IconSvgElement;
};

export const settingsMenu: SettingsMenuItem[] = [
	{
		key: 'overview',
		href: '/app/settings/overview',
		label: 'Ringkasan',
		description: 'Rangkuman akun dan aktivitas riset.',
		group: 'Pribadi',
		icon: GaugeIcon
	},
	{
		key: 'account',
		href: '/app/settings/account',
		label: 'Akun',
		description: 'Profil dan identitas yang dipakai di Aqsha.',
		group: 'Pribadi',
		icon: UserRoundIcon
	},
	{
		key: 'appearance',
		href: '/app/settings/appearance',
		label: 'Tampilan',
		description: 'Tema terang, gelap, atau mengikuti sistem.',
		group: 'Pribadi',
		icon: PaletteIcon
	},
	{
		key: 'personalization',
		href: '/app/settings/personalization',
		label: 'Personalisasi',
		description: 'Preferensi Astra dan minat riset kamu.',
		group: 'Riset',
		icon: SparklesIcon
	},
	{
		key: 'usage-billing',
		href: '/app/settings/usage-billing',
		label: 'Penggunaan & tagihan',
		description: 'Kredit, paket, dan portal pembayaran.',
		group: 'Riset',
		icon: CreditCardIcon
	},
	{
		key: 'security',
		href: '/app/settings/security',
		label: 'Keamanan',
		description: 'Kata sandi dan perangkat aktif.',
		group: 'Riset',
		icon: ShieldIcon
	},
	{
		key: 'integrations',
		href: '/app/settings/integrations',
		label: 'Integrasi',
		description: 'Hubungkan aplikasi referensi seperti Mendeley dan Zotero.',
		group: 'Riset',
		icon: PlugIcon
	}
];

export function settingsItemForPath(pathname: string): SettingsMenuItem {
	return (
		settingsMenu.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ??
		settingsMenu[0]
	);
}
