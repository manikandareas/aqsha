<script lang="ts">
	import '../app.css';
	import { defaultDescription, siteName } from '$lib/seo/config';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<!-- Default document title + description. Any page/shell that renders `<title>` deeper in the tree
	     overrides this (Svelte keeps a single title; deepest/last wins). Pages behind auth use `PageTitle`;
	     public/marketing pages use `SeoHead`. Without this, un-titled pages would have no `<title>`. -->
	<title>{siteName}</title>
	<meta name="description" content={defaultDescription} />
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" href="/icon.png" />
	<link rel="apple-touch-icon" href="/apple-icon.png" />
	<link rel="manifest" href="/manifest.webmanifest" />
</svelte:head>

{@render children()}
