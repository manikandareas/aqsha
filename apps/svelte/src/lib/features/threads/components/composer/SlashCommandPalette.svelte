<script lang="ts">
	import { DEEP_COMMAND_ID, type PromptCommand, type PromptCommandId } from '@aqsha/chat-core';
	import {
		type IconSvgElement,
		BookOpenIcon,
		ChartColumnIcon,
		CheckCircle2Icon,
		ExpandParagraphIcon,
		FileTextIcon,
		FlagIcon,
		GitBranchIcon,
		HelpCircleIcon,
		LayoutGridIcon,
		Library,
		MessageSquareIcon,
		NotebookIcon,
		PencilIcon,
		PenLineIcon,
		Quote,
		RotateCcwIcon,
		Scale,
		SearchIcon,
		ShieldCheckIcon,
		ShieldIcon,
		SparklesIcon,
		TableIcon,
		TelescopeIcon,
		TrendingUpIcon,
		WrenchIcon,
		FolderIcon
	} from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { useBillingCurrent } from '$lib/features/settings/api';
	import { deepRunsQuota } from '$lib/features/settings/lib/billing-derived';
	import ComposerPopoverShell from './ComposerPopoverShell.svelte';
	import ComposerPopoverHeader from './ComposerPopoverHeader.svelte';
	import ComposerPopoverList from './ComposerPopoverList.svelte';
	import ComposerPopoverGroup from './ComposerPopoverGroup.svelte';
	import ComposerPopoverItem from './ComposerPopoverItem.svelte';
	import ComposerPopoverEmpty from './ComposerPopoverEmpty.svelte';
	import ComposerPopoverBadge from './ComposerPopoverBadge.svelte';

	let {
		commands,
		highlightedIndex,
		onHighlight,
		onSelect
	}: {
		commands: PromptCommand[];
		highlightedIndex: number;
		onHighlight: (index: number) => void;
		onSelect: (command: PromptCommand) => void;
	} = $props();

	const promptCommandGroups = [
		'Metodologi',
		'Olah Data',
		'Penulisan Bab',
		'Literatur',
		'Bahasa & Sitasi',
		'Pertahanan',
		'Workspace'
	] as const;

	const promptCommandIconMap: Record<PromptCommandId, IconSvgElement> = {
		kuantitatif: TrendingUpIcon,
		kualitatif: MessageSquareIcon,
		campuran: GitBranchIcon,
		rnd: WrenchIcon,
		analisis: ChartColumnIcon,
		latarbelakang: FileTextIcon,
		rumusanmasalah: HelpCircleIcon,
		tujuan: FlagIcon,
		hipotesis: Scale,
		kerangka: LayoutGridIcon,
		pembahasan: PenLineIcon,
		kesimpulan: CheckCircle2Icon,
		abstrak: BookOpenIcon,
		gap: SearchIcon,
		matriks: TableIcon,
		terdahulu: Library,
		deep: TelescopeIcon,
		akademik: SparklesIcon,
		puebi: ShieldCheckIcon,
		sitasi: Quote,
		parafrase: RotateCcwIcon,
		expand: ExpandParagraphIcon,
		summarize: FileTextIcon,
		sidang: ShieldIcon,
		reviewer: PencilIcon,
		artifact: NotebookIcon,
		workspace: FolderIcon
	};

	// Deep Research quota overlaid on the `/deep` item (app-wide cache, no extra fetch).
	const auth = getAuthState();
	const billing = useBillingCurrent(() => auth.isSignedIn);

	// Flat index across groups (matches keyboard nav order in TokenizedPromptInput).
	const layout = $derived.by(() => {
		let flat = 0;
		return promptCommandGroups
			.map((group) => {
				const groupCommands = commands.filter((item) => item.group === group);
				const startIndex = flat;
				flat += groupCommands.length;
				return { group, groupCommands, startIndex };
			})
			.filter((g) => g.groupCommands.length > 0);
	});
</script>

<ComposerPopoverShell>
	<ComposerPopoverHeader title="Perintah" count={commands.length} />
	<ComposerPopoverList id="composer-slash-commands">
		{#if commands.length === 0}
			<ComposerPopoverEmpty title="Tidak ada perintah yang cocok">
				{#snippet hint()}
					Coba kata kunci lain, mis. <span class="font-mono">kuantitatif</span> atau
					<span class="font-mono">matriks</span>.
				{/snippet}
			</ComposerPopoverEmpty>
		{:else}
			{#each layout as { group, groupCommands, startIndex } (group)}
				<ComposerPopoverGroup label={group}>
					{#each groupCommands as item, index (item.id)}
						{@const itemIndex = startIndex + index}
						<ComposerPopoverItem
							icon={promptCommandIconMap[item.id as PromptCommandId] ?? LayoutGridIcon}
							title={item.label}
							description={item.description}
							active={itemIndex === highlightedIndex}
							onSelect={() => onSelect(item)}
							onMouseEnter={() => onHighlight(itemIndex)}
						>
							{#snippet meta()}
								{#if item.id === DEEP_COMMAND_ID && billing.data}
									{@const quota = deepRunsQuota(billing.data)}
									{#if quota.unlimited}
										<ComposerPopoverBadge tone="muted">tanpa batas</ComposerPopoverBadge>
									{:else}
										<ComposerPopoverBadge tone={quota.remaining > 0 ? 'accent' : 'muted'}>
											{quota.remaining} tersisa
										</ComposerPopoverBadge>
									{/if}
								{/if}
								<span class="font-mono text-micro text-muted-foreground/70">{item.slug}</span>
							{/snippet}
						</ComposerPopoverItem>
					{/each}
				</ComposerPopoverGroup>
			{/each}
		{/if}
	</ComposerPopoverList>
</ComposerPopoverShell>
