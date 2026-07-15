<script lang="ts">
	import {
		type CommandSegment,
		type MentionSegment,
		parseCommandSegments,
		parseMentionSegments,
		stripMentionMarkers
	} from '@aqsha/chat-core';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import type { MessageAttachment } from '../lib/attachment-buckets';
	import {
		splitTokenLabel,
		TOKEN_PILL_LABEL_CLASS,
		TOKEN_PILL_PREFIX_CLASS,
		type TokenPillKind,
		tokenPillClass
	} from '../lib/token-pill';
	import type { TimelinePart } from '../lib/timeline-types';
	import FileChip from './composer/FileChip.svelte';
	import { getMessageInteractions } from './message-interactions';

	/**
	 * User message bubble — text (with `@mention` / `/command` pills) + upload attachments. Mention
	 * markers (U+E000/E001) are injected by the composer on send and persisted; `parseMentionSegments`
	 * splits them back here. Commands serialize as a plain slug → `parseCommandSegments` matches by slug
	 * so old messages pill too. Visual treatment shares chip classes with the composer (`token-pill.ts`),
	 * bubble tone (over `bg-primary`).
	 */
	let { parts, attachments }: { parts: TimelinePart[]; attachments?: MessageAttachment[] } =
		$props();

	const interactions = getMessageInteractions();

	const text = $derived(
		parts
			.filter((p): p is Extract<TimelinePart, { kind: 'text' }> => p.kind === 'text')
			.map((p) => p.text)
			.join('')
	);
	const hasAttachments = $derived((attachments?.length ?? 0) > 0);

	const segments = $derived(
		parseMentionSegments(text).flatMap((seg): Array<MentionSegment | CommandSegment> =>
			seg.type === 'mention' ? [seg] : parseCommandSegments(stripMentionMarkers(seg.value))
		)
	);
</script>

{#snippet bubblePill(kind: TokenPillKind, label: string, title: string, description?: string)}
	{@const parts = splitTokenLabel(label)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class={tokenPillClass('bubble', kind)}>
					{#if parts.prefix}<span class={TOKEN_PILL_PREFIX_CLASS}>{parts.prefix}</span>{/if}
					<span class={TOKEN_PILL_LABEL_CLASS}>{parts.text}</span>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content>
			<div>
				<p class="font-medium break-words">{title}</p>
				{#if description}<p class="mt-0.5 break-words opacity-70">{description}</p>{/if}
			</div>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

{#if text || hasAttachments}
	<div class="flex flex-col items-end gap-1.5">
		{#if hasAttachments}
			<div class="flex max-w-[80%] flex-wrap justify-end gap-2">
				{#each attachments ?? [] as a (a.id)}
					<FileChip
						id={a.id}
						title={a.title}
						mimeType={a.mimeType}
						indexingStatus={a.indexingStatus}
						onOpen={interactions.openArtifact ? () => interactions.openArtifact?.(a.id) : undefined}
					/>
				{/each}
			</div>
		{/if}
		{#if text}
			<div
				class="max-w-[80%] rounded-2xl bg-primary px-4 py-2 text-sm break-words whitespace-pre-wrap text-primary-foreground"
			>
				{#each segments as seg, i (i)}
					{#if seg.type === 'mention'}
						{@render bubblePill('mention', seg.label, splitTokenLabel(seg.label).text.trim())}
					{:else if seg.type === 'command'}
						{@render bubblePill(
							'command',
							seg.matched,
							`${seg.command.slug} · ${seg.command.label}`,
							seg.command.description
						)}
					{:else}
						<span>{seg.value}</span>
					{/if}
				{/each}
			</div>
		{/if}
	</div>
{/if}
