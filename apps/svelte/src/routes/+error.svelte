<script lang="ts">
	import { page } from '$app/state';
	import ErrorStatePage from '$lib/components/ErrorStatePage.svelte';
	import { siteName } from '$lib/seo/config';

	// Root error boundary (plan §Phase 2 task 7, diperkaya Phase 4). Merender ErrorStatePage:
	// 404 (padanan `not-found.tsx`) vs gangguan generik (padanan `error.tsx`/`global-error.tsx`).
	// `App.Error` dinormalisasi `{ message, code }` dari `error()` / `handleError`→Sentry.
	const isNotFound = $derived(page.status === 404);
	const title = $derived(isNotFound ? 'Halaman tidak ditemukan' : 'Terjadi gangguan');
	const code = $derived(page.error?.code);
	const referenceCode = $derived(
		code && code !== 'unexpected' && code !== 'unknown' && code !== 'not_found' ? code : undefined
	);
</script>

<svelte:head>
	<title>{title} | {siteName}</title>
</svelte:head>

{#if isNotFound}
	<ErrorStatePage
		eyebrow="404"
		title="Halaman tidak ditemukan"
		description="Halaman yang kamu cari tidak tersedia. Tautannya mungkin berubah, dipindahkan, atau tidak lagi bisa diakses. Kembali ke workspace untuk lanjut dari tempat yang jelas."
		imageAlt="Ilustrasi halaman tidak ditemukan"
		imageSrc="/not-found.png"
		primaryAction={{ label: 'Workspace', href: '/app' }}
		secondaryAction={{ label: 'Kembali', behavior: 'back' }}
	/>
{:else}
	<ErrorStatePage
		eyebrow="Terjadi gangguan"
		title="Terjadi gangguan"
		description="Ada bagian yang gagal dimuat. Coba lagi sebentar. Kalau masih muncul, kembali ke ruang kerja dan lanjutkan dari sana."
		imageAlt="Ilustrasi gangguan pemuatan"
		imageSrc="/error.png"
		primaryAction={{ label: 'Coba lagi', onClick: () => location.reload() }}
		secondaryAction={{ label: 'Workspace', href: '/app' }}
		{referenceCode}
	/>
{/if}
