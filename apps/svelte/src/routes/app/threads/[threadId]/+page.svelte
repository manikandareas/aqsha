<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { Button } from '$lib/components/ui/button';
	import Markdown from '$lib/components/Markdown.svelte';
	import { createMastraClient } from '$lib/threads/mastra-client';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { ChatAgent } from '$lib/threads/agent.svelte';

	const clerk = useClerkContext();
	const threadId = $derived(page.params.threadId);
	// Memoize the volatile Clerk reads as PRIMITIVES. `clerk.auth` is a derived object Clerk rebuilds
	// on every internal churn (token refresh, `getToken()` during streaming) — reading it directly in
	// the lifecycle effect below would re-run the effect on identity change, destroying the agent
	// mid-stream and wiping the timeline. `$derived` gates on value equality so the effect only
	// re-runs when the userId string / isLoaded boolean actually change.
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);

	let agent = $state<ChatAgent | null>(null);
	let composer = $state('');

	// Subscription lifecycle (valid `$effect` use per §3.4 — external-source sync with cleanup, NOT
	// derived-state-in-effect): (re)create the agent + its single long-lived subscribeToThread when
	// the thread or the signed-in user changes; tear it down on change/unmount.
	$effect(() => {
		const tid = threadId;
		const uid = userId;
		// Wait for clerk-js to finish loading (clerkLoaded) so `session.getToken()` yields a real bearer —
		// userId alone arrives from SSR initialState before the session exists (see /app note).
		if (!tid || !uid || !clerkLoaded) return;
		const client = createMastraClient(clerkTokenGetter(clerk));
		const a = new ChatAgent({ client, threadId: tid, resourceId: uid });
		a.start();
		agent = a;
		return () => {
			a.destroy();
			agent = null;
		};
	});

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		const text = composer.trim();
		if (!text || !agent || agent.status !== 'ready') return;
		composer = '';
		await agent.send(text);
	}

	const busy = $derived(agent?.status === 'submitted' || agent?.status === 'streaming');
</script>

<main class="mx-auto flex h-svh max-w-2xl flex-col">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<a href={resolve('/app')} class="text-sm text-muted-foreground hover:text-foreground"
			>← Percakapan</a
		>
		<span class="font-mono text-xs text-muted-foreground">{threadId?.slice(0, 8)}…</span>
	</header>

	<section class="flex-1 space-y-4 overflow-y-auto px-4 py-6">
		{#if !clerk.isLoaded}
			<p class="text-sm text-muted-foreground">Memuat Clerk…</p>
		{:else if !clerk.auth.userId}
			<p class="text-sm text-muted-foreground">Belum masuk.</p>
		{:else if agent && agent.messages.length === 0}
			<p class="text-sm text-muted-foreground">
				Kirim pesan pertama untuk memulai percakapan dengan Astra.
			</p>
		{/if}

		{#each agent?.messages ?? [] as message (message.id)}
			{#if message.role === 'user'}
				<div class="flex justify-end">
					<div class="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground">
						{message.parts
							.filter((p) => p.kind === 'text')
							.map((p) => (p.kind === 'text' ? p.text : ''))
							.join('')}
					</div>
				</div>
			{:else}
				<div class="flex flex-col gap-2">
					{#each message.parts as part (part.id)}
						{#if part.kind === 'text'}
							<div class="prose prose-sm max-w-none text-sm text-foreground">
								<Markdown content={part.text} />
							</div>
						{:else if part.kind === 'reasoning'}
							<div
								class="rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
							>
								<span class="font-medium">Penalaran{part.thinking ? '…' : ''}</span>
								<div class="mt-1 whitespace-pre-wrap">{part.text}</div>
							</div>
						{:else if part.kind === 'tool'}
							<div
								class="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
							>
								<span class="font-mono">{part.name || 'tool'}</span>
								<span>· {part.status}</span>
							</div>
						{/if}
					{/each}
					{#if message.streaming && message.parts.length === 0}
						<span class="text-sm text-muted-foreground">Astra sedang mengetik…</span>
					{/if}
				</div>
			{/if}
		{/each}

		{#if agent?.error}
			<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{agent.error}</p>
		{/if}
	</section>

	<form class="flex items-end gap-2 border-t border-border p-4" onsubmit={submit}>
		<textarea
			bind:value={composer}
			rows="1"
			placeholder="Tulis pesan untuk Astra…"
			class="flex-1 resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onkeydown={(e) => {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					(e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
				}
			}}></textarea>
		{#if busy}
			<Button type="button" variant="outline" onclick={() => agent?.stop()}>Hentikan</Button>
		{:else}
			<Button type="submit" disabled={!composer.trim() || !agent}>Kirim</Button>
		{/if}
	</form>
</main>
