<script lang="ts">
	import {
		locale,
		ogImageAlt,
		ogImagePath,
		seoAllowIndexing,
		siteName,
		siteUrl,
		verification
	} from './config';
	import type { PageSeo } from './metadata';

	let { seo }: { seo: PageSeo } = $props();

	// Document title pakai template Next `%s | Aqsha`; og/twitter title = mentah (padanan Next).
	const documentTitle = $derived(`${seo.title} | ${siteName}`);
	const ogType = $derived(seo.ogType ?? 'website');
	// Gambar OG/Twitter absolut: override per-halaman (cover blog) atau kartu situs default.
	const imageUrl = $derived(seo.image ?? `${siteUrl}${ogImagePath}`);

	// Escape `<` → < supaya penutup tag script di dalam data tak memecah tag JSON-LD (JSON tetap
	// valid). `<\/script>` (dengan backslash) mencegah HTML tokenizer Svelte menutup blok script dini.
	function jsonLdScript(data: unknown): string {
		const json = JSON.stringify(data).replace(/</g, '\\u003c');
		return `<script type="application/ld+json">${json}</` + `script>`;
	}
</script>

<svelte:head>
	<title>{documentTitle}</title>
	<meta name="description" content={seo.description} />
	<meta name="application-name" content={siteName} />
	<link rel="canonical" href={seo.canonical} />

	{#if !seoAllowIndexing}
		<!-- Preview deployment: noindex sampai cutover (§10 Phase 4). robots.txt juga disallow-all. -->
		<meta name="robots" content="noindex, nofollow" />
	{/if}

	<!-- Open Graph -->
	<meta property="og:type" content={ogType} />
	<meta property="og:site_name" content={siteName} />
	<meta property="og:locale" content={locale} />
	<meta property="og:url" content={seo.canonical} />
	<meta property="og:title" content={seo.title} />
	<meta property="og:description" content={seo.description} />
	<meta property="og:image" content={imageUrl} />
	<meta property="og:image:alt" content={ogImageAlt} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:type" content="image/png" />

	{#if ogType === 'article' && seo.article}
		<meta property="article:published_time" content={seo.article.publishedTime} />
		<meta property="article:modified_time" content={seo.article.modifiedTime} />
		{#each seo.article.authors ?? [] as author (author)}
			<meta property="article:author" content={author} />
		{/each}
	{/if}

	<!-- Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={seo.title} />
	<meta name="twitter:description" content={seo.description} />
	<meta name="twitter:image" content={imageUrl} />
	<meta name="twitter:image:alt" content={ogImageAlt} />

	{#if verification.google}
		<meta name="google-site-verification" content={verification.google} />
	{/if}
	{#if verification.bing}
		<meta name="msvalidate.01" content={verification.bing} />
	{/if}

	{#each seo.jsonLd ?? [] as data, i (i)}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html jsonLdScript(data)}
	{/each}
</svelte:head>
