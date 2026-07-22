<script lang="ts">
	import { resolve } from '$app/paths';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { formatRelativeToNow, WORKSPACE_KIND_LABELS } from '../labels';
	import { projectAccent, type ProjectAccent } from '../project-presentation';
	import { projectDisplayTitle, type Workspace } from '../types';

	type AccentStyle = {
		cover: string;
		badge: string;
		empty: string;
	};

	const ACCENT_STYLES: Record<ProjectAccent, AccentStyle> = {
		mint: {
			cover:
				'border-mint-soft-border bg-mint-soft text-mint-foreground dark:border-border dark:bg-card dark:text-card-foreground',
			badge: 'border-mint-soft-border text-mint-foreground',
			empty: 'text-mint-foreground/70 dark:text-muted-foreground'
		},
		lavender: {
			cover:
				'border-lavender-soft-border bg-lavender-soft text-lavender-foreground dark:border-border dark:bg-card dark:text-card-foreground',
			badge: 'border-lavender-soft-border text-lavender-foreground',
			empty: 'text-lavender-foreground/70 dark:text-muted-foreground'
		},
		coral: {
			cover:
				'border-coral-soft-border bg-coral-soft text-coral-foreground dark:border-border dark:bg-card dark:text-card-foreground',
			badge: 'border-coral-soft-border text-coral-foreground',
			empty: 'text-coral-foreground/70 dark:text-muted-foreground'
		},
		lemon: {
			cover:
				'border-lemon-soft-border bg-lemon-soft text-lemon-foreground dark:border-border dark:bg-card dark:text-card-foreground',
			badge: 'border-lemon-soft-border text-lemon-foreground',
			empty: 'text-lemon-foreground/70 dark:text-muted-foreground'
		}
	};

	let { workspace }: { workspace: Workspace } = $props();

	const untitled = $derived(!workspace.name.trim() && !workspace.topicNote?.trim());
	const title = $derived(projectDisplayTitle(workspace));
	const kindLabel = $derived(WORKSPACE_KIND_LABELS[workspace.kind]);
	const note = $derived(workspace.topicNote?.trim() ?? '');
	const accent = $derived(projectAccent(workspace.kind));
	const accentStyle = $derived(ACCENT_STYLES[accent]);
	const editLabel = $derived(`Diedit ${formatRelativeToNow(workspace.updatedAt)}`);
</script>

<article
	class="group relative min-w-0 rounded-xl focus-within:outline-none focus-within:ring-[3px] focus-within:ring-ring/50"
>
	<a
		href={resolve('/app/(product)/projects/[projectId]', { projectId: workspace.id })}
		class="absolute inset-0 z-20 rounded-xl"
		aria-label={`Buka ${title}`}
	></a>

	<div
		class={cn(
			'relative flex aspect-[4/3] flex-col overflow-hidden rounded-xl border-2 px-4 pt-4 pb-3.5',
			'transition-[border-color,transform] duration-150 ease-out',
			'group-hover:-translate-y-0.5 group-hover:border-foreground/30',
			'group-focus-within:-translate-y-0.5 group-focus-within:border-ring',
			'motion-reduce:transform-none',
			accentStyle.cover
		)}
		aria-hidden="true"
	>
		<div class="flex items-center gap-2">
			{#if workspace.emoji?.trim()}
				<span class="text-base leading-none">{workspace.emoji}</span>
			{/if}
			<span
				class={cn(
					'rounded-full border bg-card/90 px-2.5 py-1 text-micro font-semibold shadow-none',
					accentStyle.badge
				)}
			>
				{kindLabel}
			</span>
		</div>

		{#if note}
			<p class="mt-4 line-clamp-4 max-w-[34ch] text-[0.8rem] leading-relaxed text-current/80">
				{note}
			</p>
		{:else}
			<p class={cn('font-hand mt-4 text-xl leading-snug', accentStyle.empty)}>Belum ada catatan</p>
		{/if}
	</div>

	<div class="min-w-0 px-1 pt-3 pb-1">
		<h3
			class={cn(
				'text-control truncate leading-snug tracking-normal',
				untitled ? 'italic text-muted-foreground' : 'font-semibold text-foreground'
			)}
		>
			{title}
		</h3>
		<p class="mt-1 text-label text-muted-foreground">{editLabel}</p>
	</div>
</article>
