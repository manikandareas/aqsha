<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { toast } from 'svelte-sonner';
	import { Icon, CheckIcon, PlusIcon } from '$lib/icons';
	import {
		EMPTY_CITATION_FILTERS,
		useCitationsList,
		useLinkCitation,
		useWorkspaceCitations
	} from '../api';
	import { citationMetaLine } from '../types';

	/**
	 * Tautkan referensi perpustakaan yang sudah ada ke proyek. Link di level
	 * proyek; penandaan bab lewat Select di panel Sumber.
	 */
	let {
		open,
		onOpenChange,
		workspaceId
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		workspaceId: string;
	} = $props();

	let q = $state('');
	const list = useCitationsList(() => ({ ...EMPTY_CITATION_FILTERS, q }));
	const linked = useWorkspaceCitations(
		() => workspaceId,
		() => open
	);
	const link = useLinkCitation();

	const items = $derived(list.data?.pages.flatMap((p) => p.items) ?? []);
	const linkedIds = $derived(new Set((linked.data?.items ?? []).map((i) => i.id)));
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>Tambah dari perpustakaan</Dialog.Title>
				<Dialog.Description
					>Tautkan referensi yang sudah kamu simpan ke proyek ini.</Dialog.Description
				>
			</Dialog.Header>
			<Input bind:value={q} placeholder="Cari di perpustakaan…" aria-label="Cari referensi" />
			<div class="max-h-80 min-h-0 overflow-y-auto">
				{#if list.isPending}
					<div class="flex items-center justify-center gap-2 py-8 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat…</span>
					</div>
				{:else if items.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">
						{q ? 'Tidak ada yang cocok.' : 'Perpustakaanmu masih kosong.'}
					</p>
				{:else}
					<ul class="grid gap-1.5">
						{#each items as item (item.id)}
							{@const isLinked = linkedIds.has(item.id)}
							<li
								class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{item.title}</p>
									<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
								</div>
								<Button
									type="button"
									variant={isLinked ? 'ghost' : 'outline'}
									size="sm"
									class="gap-1.5"
									disabled={isLinked || link.isPending}
									onclick={() =>
										link.mutate(
											{ workspaceId, citationId: item.id },
											{ onSuccess: () => toast.success('Ditautkan ke proyek') }
										)}
								>
									{#if isLinked}
										<Icon icon={CheckIcon} class="size-3.5" /> Sudah ada
									{:else}
										<Icon icon={PlusIcon} class="size-3.5" /> Tambahkan
									{/if}
								</Button>
							</li>
						{/each}
					</ul>
					{#if list.hasNextPage}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							class="mx-auto mt-2 flex"
							onclick={() => list.fetchNextPage()}
						>
							Muat lagi
						</Button>
					{/if}
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
