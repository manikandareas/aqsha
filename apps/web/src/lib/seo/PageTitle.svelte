<script lang="ts">
	import { siteName } from './config';

	// Lightweight document-title helper for the authenticated app surface (behind auth → noindex, so
	// no OG/Twitter/canonical like `SeoHead`; only the browser-tab `<title>`). Applies the same
	// `%s | Aqsha` template as Next's root `title.template`. Svelte keeps a single `<title>` and the
	// deepest/last-rendered wins (server renderer `set_title` path compare), so this overrides the
	// root-layout default whenever a page/shell renders it. A nullish `title` (query still loading)
	// falls back to the bare site name — same as Next's `title.default`.
	let { title }: { title?: string | null } = $props();

	const documentTitle = $derived(title ? `${title} | ${siteName}` : siteName);
</script>

<svelte:head>
	<title>{documentTitle}</title>
</svelte:head>
