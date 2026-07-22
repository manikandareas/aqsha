<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Conversation, ConversationContent } from '$lib/components/ai-elements';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import OlderHistorySentinel from '$lib/features/threads/components/OlderHistorySentinel.svelte';
	import type { ThreadHistoryControls } from '$lib/features/threads/lib/thread-history';
	import type { TimelineMessage } from '$lib/features/threads/lib/timeline-types';

	let {
		messages,
		loading = false,
		error = null,
		history = null,
		onretry
	}: {
		messages: TimelineMessage[];
		loading?: boolean;
		error?: string | null;
		history?: ThreadHistoryControls | null;
		onretry?: () => void;
	} = $props();

	function snapshotText(message: TimelineMessage): string {
		const text = message.parts
			.filter((part) => part.kind === 'text')
			.map((part) => part.text)
			.join('\n\n')
			.trim();
		if (text) return text;
		return message.role === 'assistant' ? 'Astra menyelesaikan proses pada pesan ini.' : '';
	}
</script>

<div class="flex h-full min-h-0 w-full flex-col">
	<Conversation class="flex-1">
		<ConversationContent class="max-w-none p-0">
			<div class={cn(threadTranscriptColumnClass, 'flex flex-col gap-4 pt-3 pb-8')}>
				{#if history && messages.length > 0}
					<OlderHistorySentinel {history} />
				{/if}
				{#if messages.length > 0}
					<div class="flex flex-col gap-5">
						{#each messages as message (message.id)}
							<div
								class={cn(
									'max-w-[85%] whitespace-pre-wrap text-sm leading-relaxed',
									message.role === 'user'
										? 'ml-auto rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground'
										: 'mr-auto text-foreground'
								)}
							>
								{snapshotText(message)}
							</div>
						{/each}
					</div>
				{:else if loading}
					<div class="flex flex-col gap-3 py-4" aria-label="Memuat riwayat" role="status">
						<div class="h-16 w-2/3 animate-pulse rounded-xl bg-muted"></div>
						<div class="ml-auto h-10 w-1/2 animate-pulse rounded-xl bg-muted"></div>
					</div>
				{/if}
				{#if error}
					<div class="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
						<p class="text-sm text-destructive">{error}</p>
						<Button type="button" size="sm" variant="outline" onclick={onretry}>Coba lagi</Button>
					</div>
				{/if}
			</div>
		</ConversationContent>
	</Conversation>
	<div class={cn(threadTranscriptColumnClass, 'pb-4')}>
		<div
			role="textbox"
			aria-disabled="true"
			aria-label="Composer sedang disiapkan"
			class="rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm text-muted-foreground"
		>
			{error ? 'Astra belum siap. Coba aktifkan ulang runtime.' : 'Astra sedang disiapkan…'}
		</div>
	</div>
</div>
