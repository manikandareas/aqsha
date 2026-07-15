// Configurable house-ads for the Explore feed (own-product promo slot, not third-party ads). Add/edit a
// campaign here — HouseAdBanner renders every variant, and ExploreFindings interleaves it between feed
// blocks. Copy is sentence case (see brand voice). `href` internal → resolve()/`<a>`; set `external` for
// a raw `<a target=_blank>`.

export type HouseAdAccent = 'mint' | 'lavender' | 'coral';

export type HouseAd = {
	id: string;
	eyebrow: string;
	title: string;
	body: string;
	ctaLabel: string;
	href: string;
	accent: HouseAdAccent;
	// Campaign image (path in /static or URL). Owner swaps with real creative. When
	// empty, HouseAdBanner shows an accent icon panel instead.
	image?: string;
	external?: boolean;
};

export const HOUSE_ADS: HouseAd[] = [
	{
		id: 'astra-deep',
		eyebrow: 'Astra · deep research',
		title: 'Lagi penasaran soal satu topik?',
		body: 'Astra menjelajah banyak sumber sekaligus lalu menyusun rangkuman ber-sitasi — cukup dari satu pertanyaan.',
		ctaLabel: 'Coba deep research',
		href: '/app/threads',
		accent: 'mint',
		image: '/pro-agent.png'
	},
	{
		id: 'aqsha-app',
		eyebrow: 'Aqsha',
		title: 'Simpan sekarang, teliti nanti',
		body: 'Kumpulkan paper & berita ke workspace, lanjut baca dan tanya Astra kapan pun kamu siap.',
		ctaLabel: 'Buka workspace',
		href: '/app',
		accent: 'lavender',
		image: '/general-agent.png'
	}
];
