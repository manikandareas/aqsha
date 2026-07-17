<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, LayersIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { useDuplicateGroups, useMergeManyCitations } from '../api';
	import { CITATION_STATUS_LABELS, type CitationDuplicateGroup, citationMetaLine } from '../types';

	/**
	 * "Kelola duplikat" — grup kandidat duplikat (canonical key sama). Tiap grup bisa
	 * digabungkan menjadi satu (target = paling lengkap, dipilih server); sisanya
	 * di-soft-delete. Fallback judul hanya KANDIDAT, jadi keputusan gabung tetap manual.
	 */
	let {
		workspaceId,
		open,
		onOpenChange
	}: {
		workspaceId: string;
		open: boolean;
		onOpenChange: (open: boolean) => void;
	} = $props();

	const groups = useDuplicateGroups(() => open);
	const mergeMany = useMergeManyCitations();
	const data = $derived(groups.data ?? []);
</script>

{#snippet groupCard(group: CitationDuplicateGroup)}
	<div class="grid gap-2 rounded-lg border border-border/70 p-3">
		<ul class="grid gap-1.5">
			{#each group.members as member (member.id)}
				<li class="grid gap-0.5">
					<span class="flex items-center gap-1.5">
						<span
							aria-hidden="true"
							title={CITATION_STATUS_LABELS[member.metadataStatus]}
							class={cn(
								'size-1.5 shrink-0 rounded-full',
								member.metadataStatus === 'verified'
									? 'bg-mint'
									: member.metadataStatus === 'needs_review'
										? 'bg-amber-400'
										: 'bg-destructive/70'
							)}
						></span>
						<span class="truncate text-[13px] font-semibold text-foreground">{member.title}</span>
					</span>
					<span class="truncate pl-3 text-[12px] font-medium text-muted-foreground">
						{citationMetaLine(member)}
					</span>
				</li>
			{/each}
		</ul>
		<div class="flex justify-end">
			<Button
				type="button"
				variant="secondary"
				class="h-8 rounded-full px-3"
				disabled={mergeMany.isPending}
				onclick={() => mergeMany.mutate({ ids: group.members.map((m) => m.id) })}
			>
				<Icon icon={LayersIcon} class="size-3.5" />
				Gabungkan {group.members.length}
			</Button>
		</div>
	</div>
{/snippet}

<Dialog.Root {open} {onOpenChange}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Kelola duplikat</Dialog.Title>
			<Dialog.Description>
				Referensi dengan identitas serupa (DOI/ISBN, atau judul + tahun + penulis). Gabungkan untuk
				menyisakan satu — field yang kosong akan dilengkapi.
			</Dialog.Description>
		</Dialog.Header>
		<div class="grid max-h-[60vh] gap-3 overflow-y-auto">
			{#if groups.isLoading}
				<p class="py-6 text-center text-[13px] font-medium text-muted-foreground">
					Memeriksa duplikat…
				</p>
			{:else if data.length === 0}
				<p class="py-6 text-center text-[13px] font-medium text-muted-foreground">
					Tidak ada kandidat duplikat di library ini.
				</p>
			{:else}
				{#each data as group (group.canonicalKey)}
					{@render groupCard(group)}
				{/each}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
