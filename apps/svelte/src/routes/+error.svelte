<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	// Root error boundary (plan §Phase 2 task 7). Merender `App.Error` yang dinormalisasi
	// (`{ message, code }`) baik dari `error()` (expected) maupun `handleError`→Sentry (unexpected).
	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Terjadi kesalahan tak terduga.');
	const code = $derived(page.error?.code);
</script>

<main
	class="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-4 p-8 text-center"
>
	<p class="text-5xl font-semibold text-muted-foreground">{status}</p>
	<h1 class="text-lg font-medium text-foreground">{message}</h1>
	{#if code && code !== 'unexpected' && code !== 'unknown'}
		<p class="text-xs text-muted-foreground">Kode: {code}</p>
	{/if}
	<a class="text-sm text-primary underline underline-offset-4" href={resolve('/')}
		>Kembali ke beranda</a
	>
</main>
