<script lang="ts">
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '$lib/components/ui/button';

	// Phase 1 connected-slice entry. Not the ported landing (that is Phase 4) — just a door into the
	// authenticated slice so the gate can be exercised end-to-end.
	const clerk = useClerkContext();
</script>

<main class="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-6 p-8">
	<h1 class="text-center text-3xl font-semibold tracking-tight text-foreground">
		Aqsha — SvelteKit connected slice
	</h1>
	<p class="text-center text-sm text-muted-foreground">
		Phase 1 GO/NO-GO gate: svelte-clerk auth → open a thread → Mastra stream → svelte-streamdown.
	</p>

	<div class="flex items-center gap-3">
		{#if clerk.auth.userId}
			<Button href="/app">Buka /app</Button>
		{:else}
			<Button href="/sign-in">Masuk</Button>
			<Button variant="outline" href="/app">Ke /app (akan diarahkan ke sign-in)</Button>
		{/if}
	</div>

	<p class="text-xs text-muted-foreground">
		{clerk.isLoaded ? (clerk.auth.userId ? 'Sudah masuk' : 'Belum masuk') : 'Memuat Clerk…'}
	</p>
</main>
