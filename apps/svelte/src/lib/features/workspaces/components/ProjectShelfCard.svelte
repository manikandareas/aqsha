<script lang="ts">
	import { resolve } from '$app/paths';
	import * as Avatar from '@aqsha/ui-svelte/components/avatar';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { viewerContext } from '$lib/auth';
	import { formatDeadline, formatRelativeToNow, WORKSPACE_KIND_LABELS } from '../labels';
	import { projectAccent, type ProjectAccent } from '../project-presentation';
	import { projectShelfPreview } from '../project-shelf-preview';
	import { projectDisplayTitle, type WorkspaceListItem } from '../types';
	import ProjectShelfCardActions from './ProjectShelfCardActions.svelte';

	type AccentStyle = {
		cover: string;
		badge: string;
	};

	const ACCENT_STYLES: Record<ProjectAccent, AccentStyle> = {
		mint: {
			cover: 'bg-mint-soft text-mint-foreground dark:bg-card dark:text-card-foreground',
			badge: 'border-mint-soft-border text-mint-foreground'
		},
		lavender: {
			cover: 'bg-lavender-soft text-lavender-foreground dark:bg-card dark:text-card-foreground',
			badge: 'border-lavender-soft-border text-lavender-foreground'
		},
		coral: {
			cover: 'bg-coral-soft text-coral-foreground dark:bg-card dark:text-card-foreground',
			badge: 'border-coral-soft-border text-coral-foreground'
		},
		lemon: {
			cover: 'bg-lemon-soft text-lemon-foreground dark:bg-card dark:text-card-foreground',
			badge: 'border-lemon-soft-border text-lemon-foreground'
		}
	};

	let { workspace }: { workspace: WorkspaceListItem } = $props();

	const viewer = viewerContext.get();
	const display = $derived(viewer.display({ name: 'Aqsha user', email: 'Signed in' }));

	const untitled = $derived(!workspace.name.trim() && !workspace.topicNote?.trim());
	const title = $derived(projectDisplayTitle(workspace));
	const kindLabel = $derived(WORKSPACE_KIND_LABELS[workspace.kind]);
	const sneakPeek = $derived(projectShelfPreview(workspace));
	const accent = $derived(projectAccent(workspace.kind));
	const accentStyle = $derived(ACCENT_STYLES[accent]);
	const absoluteDate = $derived(formatDeadline(workspace.updatedAt));
	const relativeEditLabel = $derived(`Diedit ${formatRelativeToNow(workspace.updatedAt)}`);
</script>

<article
	class={cn(
		'group relative flex h-[17.5rem] min-w-0 flex-col gap-3 overflow-hidden rounded-2xl border-0 p-3 shadow-none ring-0 outline-none',
		'transition-transform duration-150 ease-out',
		'hover:-translate-y-0.5',
		'focus-within:-translate-y-0.5',
		'motion-reduce:transform-none',
		accentStyle.cover
	)}
>
	<!-- Full-card hit target; chrome (menu) sits above via z-index so it can stop navigation. -->
	<a
		href={resolve('/app/(product)/projects/[projectId]', { projectId: workspace.id })}
		class="absolute inset-0 z-10 rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
		aria-label={`Buka ${title}`}
	></a>

	<!-- Fixed preview pane: flex-1 + overflow clip keeps card height stable across projects. -->
	<div
		class="relative z-0 min-h-0 flex-1 overflow-hidden rounded-xl border-0 bg-card text-card-foreground shadow-none ring-0 dark:bg-[color-mix(in_oklch,var(--muted)_58%,var(--card))] dark:text-foreground"
		aria-hidden="true"
	>
		{#if sneakPeek}
			<!--
				Blocks stay shrink-0 so flex never crushes line boxes (min-h-0 + many blocks
				was clipping glyph bottoms). Overflow clips at the pane edge instead.
			-->
			<div class="flex h-full flex-col gap-1 overflow-hidden px-3 py-2.5">
				{#each sneakPeek.blocks as block, index (index)}
					{#if block.type === 'title'}
						<p class="shrink-0 truncate text-[0.85rem] font-bold leading-snug text-foreground">
							{block.text}
						</p>
					{:else if block.type === 'heading'}
						<p
							class={cn(
								'shrink-0 truncate font-semibold leading-snug text-foreground',
								block.level === 1 ? 'text-[0.75rem]' : 'text-[0.7rem]'
							)}
						>
							{block.text}
						</p>
					{:else}
						<p class="line-clamp-2 shrink-0 text-[0.68rem] leading-snug text-muted-foreground">
							{block.text}
						</p>
					{/if}
				{/each}
			</div>
		{:else}
			<p
				class="grid h-full place-items-center px-3 py-2.5 text-center font-hand text-lg leading-snug text-muted-foreground"
			>
				Belum ada isi dokumen
			</p>
		{/if}
	</div>

	<div class="relative z-20 flex shrink-0 flex-col gap-1.5 px-0.5 pb-0.5">
		<div class="flex items-start gap-2">
			<h3
				class={cn(
					'min-w-0 flex-1 truncate text-[0.95rem] leading-snug tracking-normal',
					untitled ? 'italic text-current/55' : 'font-semibold text-current'
				)}
			>
				{title}
			</h3>

			<ProjectShelfCardActions {workspace} />
		</div>

		<div class="flex items-center gap-2">
			<time
				class="min-w-0 flex-1 truncate text-label text-current/55"
				datetime={new Date(workspace.updatedAt).toISOString()}
				title={relativeEditLabel}
			>
				{absoluteDate}
			</time>

			<span
				class={cn(
					'relative z-20 shrink-0 rounded-full border bg-card/90 px-2 py-0.5 text-micro font-semibold shadow-none',
					accentStyle.badge
				)}
			>
				{kindLabel}
			</span>

			<Avatar.Root
				class="relative z-20 size-7 shrink-0 rounded-full ring-1 ring-border"
				aria-hidden="true"
			>
				{#if display.image}
					<Avatar.Image src={display.image} alt="" />
				{/if}
				<Avatar.Fallback
					class="rounded-full bg-sky-soft text-[10px] font-semibold text-sky-foreground"
				>
					{display.initials}
				</Avatar.Fallback>
			</Avatar.Root>
		</div>
	</div>
</article>
