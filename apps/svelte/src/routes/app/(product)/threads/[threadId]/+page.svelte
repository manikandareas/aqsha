<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useClerkContext } from 'svelte-clerk';
	import { useQueryClient } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/ui/button';
	import { clerkTokenGetter } from '$lib/auth/token';
	import { createMastraClient } from '$lib/features/threads/lib/mastra-client';
	import { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import {
		Conversation,
		ConversationContent,
		ConversationScrollButton,
		ConversationEmptyState,
		Response,
		Reasoning
	} from '$lib/components/ai-elements';

	// Phase 6 renderer over the real thread engine (THC-1/5/6/7): ThreadAgent (durable subscription +
	// replay/reconnect) → Response/Reasoning (Streamdown adapter) inside the Conversation viewport
	// (follow-bottom). This replaces the Phase 1 throwaway slice. The FULL thread experience UI
	// (composer chips/slash/mentions, panels, tools, /deep) is Phase 7 — the composer here is a plain
	// textarea and tool/artifact parts render as compact chips.

	const clerk = useClerkContext();
	const qc = useQueryClient();
	const threadId = $derived(page.params.threadId ?? '');
	// Volatile Clerk reads memoized as PRIMITIVES (Phase 1/2 gotcha: `clerk.auth` is a derived object
	// rebuilt on every token churn — reading it in the lifecycle effect would destroy the agent mid-stream).
	const userId = $derived(clerk.auth.userId);
	const clerkLoaded = $derived(clerk.isLoaded);

	let agent = $state<ThreadAgent | null>(null);
	let composer = $state('');

	// Subscription lifecycle (valid `$effect`: external-source sync with cleanup, NOT a derived reflex).
	$effect(() => {
		const tid = threadId;
		const uid = userId;
		if (!tid || !uid || !clerkLoaded) return;
		const client = createMastraClient(clerkTokenGetter(clerk));
		const a = new ThreadAgent({
			getClient: () => client,
			threadId: tid,
			getResourceId: () => (clerk.isLoaded ? clerk.auth.userId : null),
			queryClient: qc,
			initialAgentKind: 'lite'
		});
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

<main class="flex h-svh flex-col">
	<header class="flex items-center justify-between border-b border-border px-4 py-3">
		<a href={resolve('/app')} class="text-sm text-muted-foreground hover:text-foreground"
			>← Percakapan</a
		>
		<span class="font-mono text-xs text-muted-foreground">{threadId.slice(0, 8)}…</span>
	</header>

	<Conversation class="flex-1">
		<ConversationContent>
			{#if !clerk.isLoaded}
				<p class="text-sm text-muted-foreground">Memuat…</p>
			{:else if !clerk.auth.userId}
				<p class="text-sm text-muted-foreground">Belum masuk.</p>
			{:else if agent && agent.messages.length === 0}
				<ConversationEmptyState
					title="Mulai percakapan dengan Astra"
					description="Kirim pesan pertama untuk memulai."
				/>
			{/if}

			{#each agent?.messages ?? [] as message (message.id)}
				{#if message.role === 'user'}
					<div class="flex justify-end">
						<div
							class="max-w-[85%] rounded-2xl bg-primary px-4 py-2 text-sm text-primary-foreground"
						>
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
								<Response text={part.text} streaming={message.streaming} />
							{:else if part.kind === 'reasoning'}
								<div
									class="rounded-md border border-dashed border-border px-3 py-2 text-muted-foreground"
								>
									<span class="text-xs font-medium">Penalaran{part.thinking ? '…' : ''}</span>
									<Reasoning text={part.text} isThinking={part.thinking} class="mt-1 text-xs" />
								</div>
							{:else if part.kind === 'tool'}
								<div
									class="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
								>
									<span class="font-mono">{part.model.title}</span>
									<span>· {part.model.status}</span>
								</div>
							{:else if part.kind === 'artifact'}
								<div class="w-fit rounded-lg border border-border px-3 py-2 text-sm">
									📄 {part.model.title}
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
				<p class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{agent.error}
				</p>
			{/if}
		</ConversationContent>
		{#snippet overlay()}
			<ConversationScrollButton />
		{/snippet}
	</Conversation>

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
