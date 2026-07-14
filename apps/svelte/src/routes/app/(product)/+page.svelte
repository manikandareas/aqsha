<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { createQuery } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import { SidebarTrigger } from '$lib/components/ui/sidebar';
	import { createBrowserApiClient } from '$lib/api/client';
	import { clerkTokenGetter } from '$lib/auth/token';

	type ChatThreadRow = {
		id: string;
		title: string | null;
		lastMessagePreview: string | null;
		lastActivityAt: number;
	};

	const clerk = useClerkContext();
	const api = createBrowserApiClient(clerkTokenGetter(clerk));

	// createQuery argument WRAPPED IN A FUNCTION (plan §3.6 gotcha) — a plain object silently breaks
	// reactivity. `enabled` gates on `clerk.isLoaded` (NOT just userId): userId arrives instantly from
	// SSR `initialState`, but `session.getToken()` returns null until clerk-js finishes loading — firing
	// before that yields a tokenless 401. Waiting for isLoaded closes that race (Clerk's <ClerkLoaded>).
	const threads = createQuery(() => ({
		queryKey: ['threads', 'list'],
		enabled: clerk.isLoaded && Boolean(clerk.auth.userId),
		queryFn: async () => {
			const { data, error } = await api.threads.get({ query: { limit: 30 } });
			if (error)
				throw new Error(typeof error.value === 'string' ? error.value : `HTTP ${error.status}`);
			return data as { items: ChatThreadRow[]; nextCursor: string | null };
		}
	}));

	function newThread() {
		goto(resolve('/app/(product)/threads/[threadId]', { threadId: crypto.randomUUID() }));
	}
</script>

<main class="mx-auto flex min-h-svh max-w-2xl flex-col gap-6 p-8">
	<header class="flex items-center justify-between gap-3">
		<div class="flex items-center gap-2">
			<SidebarTrigger />
			<div>
				<h1 class="text-xl font-semibold text-foreground">Percakapan</h1>
				<p class="text-sm text-muted-foreground">
					Eden Treaty + svelte-query (per-request client).
				</p>
			</div>
		</div>
		<Button onclick={newThread}>Percakapan baru</Button>
	</header>

	{#if threads.isPending}
		<p class="text-sm text-muted-foreground">Memuat daftar…</p>
	{:else if threads.isError}
		<p class="text-sm text-destructive">Gagal memuat: {threads.error.message}</p>
	{:else if threads.data && threads.data.items.length > 0}
		<ul class="flex flex-col divide-y divide-border rounded-lg border border-border">
			{#each threads.data.items as t (t.id)}
				<li>
					<a
						href={resolve('/app/(product)/threads/[threadId]', { threadId: t.id })}
						class="flex flex-col gap-1 px-4 py-3 hover:bg-muted/50"
						data-sveltekit-preload-data="hover"
					>
						<span class="text-sm font-medium text-foreground">{t.title ?? 'Tanpa judul'}</span>
						{#if t.lastMessagePreview}
							<span class="line-clamp-1 text-xs text-muted-foreground">{t.lastMessagePreview}</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-sm text-muted-foreground">
			Belum ada percakapan. Mulai dengan “Percakapan baru”.
		</p>
	{/if}
</main>
