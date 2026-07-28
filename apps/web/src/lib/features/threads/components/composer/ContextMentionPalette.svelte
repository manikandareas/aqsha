<script lang="ts">
	import { Icon, ChevronRightIcon, FileTextIcon, FolderIcon, Loader2Icon } from '$lib/icons';
	import type { MentionItemOption, MentionWorkspaceOption } from './palette-types';
	import ComposerPopoverShell from './ComposerPopoverShell.svelte';
	import ComposerPopoverHeader from './ComposerPopoverHeader.svelte';
	import ComposerPopoverList from './ComposerPopoverList.svelte';
	import ComposerPopoverGroup from './ComposerPopoverGroup.svelte';
	import ComposerPopoverItem from './ComposerPopoverItem.svelte';
	import ComposerPopoverEmpty from './ComposerPopoverEmpty.svelte';
	import ComposerPopoverBadge from './ComposerPopoverBadge.svelte';

	let {
		mode,
		workspaceOptions,
		itemOptions,
		itemsLoading = false,
		drillWorkspaceName,
		highlightedIndex,
		capNotice,
		onHighlight,
		onSelectWorkspace,
		onDrillWorkspace,
		onSelectItem,
		onBack
	}: {
		mode: 'workspace' | 'item';
		workspaceOptions: MentionWorkspaceOption[];
		itemOptions: MentionItemOption[];
		itemsLoading?: boolean;
		drillWorkspaceName?: string;
		highlightedIndex: number;
		capNotice?: string | null;
		onHighlight: (index: number) => void;
		onSelectWorkspace: (option: MentionWorkspaceOption) => void;
		onDrillWorkspace: (option: MentionWorkspaceOption) => void;
		onSelectItem: (option: MentionItemOption) => void;
		onBack: () => void;
	} = $props();

	const count = $derived(mode === 'workspace' ? workspaceOptions.length : itemOptions.length);
</script>

<ComposerPopoverShell>
	<ComposerPopoverHeader
		title={mode === 'item' ? (drillWorkspaceName ?? 'Workspace') : 'Konteks'}
		{count}
		onBack={mode === 'item' ? onBack : undefined}
		backLabel="Kembali ke daftar workspace"
	/>
	<ComposerPopoverList id="composer-context-mentions">
		{#if capNotice}
			<p class="px-2 py-1.5 text-label font-medium text-lemon-foreground">
				{capNotice}
			</p>
		{/if}
		{#if mode === 'workspace'}
			{#if workspaceOptions.length === 0}
				<ComposerPopoverEmpty title="Tidak ada workspace yang cocok" />
			{:else}
				<ComposerPopoverGroup>
					{#each workspaceOptions as option, index (option.workspaceId)}
						<ComposerPopoverItem
							emoji={option.emoji}
							icon={FolderIcon}
							title={option.name}
							active={index === highlightedIndex}
							disabled={option.disabled}
							pinTrailing
							onSelect={() => onSelectWorkspace(option)}
							onMouseEnter={() => onHighlight(index)}
						>
							{#snippet meta()}
								{#if option.isAmbient}
									<ComposerPopoverBadge tone="muted">ruang ini</ComposerPopoverBadge>
								{:else if option.disabled && option.disabledReason}
									<span class="max-w-[7.5rem] truncate text-micro text-muted-foreground"
										>{option.disabledReason}</span
									>
								{/if}
							{/snippet}
							{#snippet trailing()}
								<button
									type="button"
									aria-label={`Lihat paper di ${option.name}`}
									onmousedown={(e) => {
										e.preventDefault();
										e.stopPropagation();
									}}
									onclick={(e) => {
										e.preventDefault();
										e.stopPropagation();
										onDrillWorkspace(option);
									}}
									class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
								>
									<Icon icon={ChevronRightIcon} class="size-3.5" />
								</button>
							{/snippet}
						</ComposerPopoverItem>
					{/each}
				</ComposerPopoverGroup>
			{/if}
		{:else if itemsLoading}
			<div
				class="flex items-center justify-center gap-2 px-3 py-6 text-label text-muted-foreground"
			>
				<Icon icon={Loader2Icon} class="size-3.5 animate-spin" />
				Memuat paper…
			</div>
		{:else if itemOptions.length === 0}
			<ComposerPopoverEmpty title="Belum ada paper di workspace ini" />
		{:else}
			<ComposerPopoverGroup>
				{#each itemOptions as option, index (option.artifactId)}
					<ComposerPopoverItem
						icon={FileTextIcon}
						title={option.title}
						active={index === highlightedIndex}
						disabled={option.disabled}
						onSelect={() => onSelectItem(option)}
						onMouseEnter={() => onHighlight(index)}
					>
						{#snippet meta()}
							{#if option.disabled && option.disabledReason}
								<span class="max-w-[7.5rem] truncate text-micro text-muted-foreground"
									>{option.disabledReason}</span
								>
							{/if}
						{/snippet}
					</ComposerPopoverItem>
				{/each}
			</ComposerPopoverGroup>
		{/if}
	</ComposerPopoverList>
</ComposerPopoverShell>
