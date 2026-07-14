/** Ringkasan update terbaru untuk pill pembuka hero (dibaca build-time di +page.server.ts). */
export type LatestUpdate = { title: string; href: string; tag: string };

/** Ringkasan rilis terbaru untuk teaser landing (serializable — tanpa MDX). */
export type TeaserLatest = {
	href: string;
	title: string;
	publishedAt: string;
	summary?: string;
};
