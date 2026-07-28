<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Icon, SearchIcon } from '$lib/icons';
	import { EMPTY_CITATION_FILTERS, useCitationCandidates, useLinkCitation } from '../../api';
	import { citationMetaLine } from '../../types';

	/**
	 * Picker "Tambah dari Perpustakaan": cari referensi akun yang sudah ada dan tautkan ke
	 * proyek aktif — link, bukan salinan. Tetap terbuka setelah menautkan agar pengguna bisa
	 * menambahkan beberapa referensi berturut-turut.
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

	let searchDraft = $state('');
	const filters = $derived({ ...EMPTY_CITATION_FILTERS, q: searchDraft.trim() });

	const candidates = useCitationCandidates(
		() => workspaceId,
		() => filters,
		() => open
	);
	const link = useLinkCitation();

	const items = $derived(candidates.data?.pages.flatMap((p) => p.items) ?? []);
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>Tambah dari Perpustakaan</Dialog.Title>
				<Dialog.Description>
					Tautkan referensi yang sudah ada di perpustakaan ke proyek ini — referensi tetap satu
					salinan.
				</Dialog.Description>
			</Dialog.Header>
			<div class="relative">
				<Icon
					icon={SearchIcon}
					class="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					bind:value={searchDraft}
					placeholder="Cari judul, penulis, atau DOI…"
					class="pl-8"
					aria-label="Cari referensi"
				/>
			</div>
			<div class="grid max-h-80 gap-1.5 overflow-y-auto">
				{#if candidates.isPending}
					<p class="py-6 text-center text-[13px] font-medium text-muted-foreground">
						Memuat referensi…
					</p>
				{:else if items.length === 0}
					<p class="py-6 text-center text-[13px] font-medium text-muted-foreground">
						Tidak ada referensi yang cocok.
					</p>
				{:else}
					{#each items as item (item.id)}
						<div class="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2">
							<div class="min-w-0 flex-1">
								<p class="truncate text-[13px] font-medium text-foreground">{item.title}</p>
								<p class="truncate text-label text-muted-foreground">{citationMetaLine(item)}</p>
							</div>
							{#if item.linked}
								<Button type="button" size="sm" variant="outline" class="shrink-0" disabled>
									Sudah di proyek
								</Button>
							{:else}
								<Button
									type="button"
									size="sm"
									variant="outline"
									class="shrink-0"
									disabled={link.isPending}
									onclick={() => link.mutate({ workspaceId, citationId: item.id })}
								>
									Tambahkan
								</Button>
							{/if}
						</div>
					{/each}
				{/if}
			</div>
			{#if candidates.hasNextPage}
				<Button
					type="button"
					variant="outline"
					class="mx-auto"
					disabled={candidates.isFetchingNextPage}
					onclick={() => candidates.fetchNextPage()}
				>
					{candidates.isFetchingNextPage ? 'Memuat…' : 'Muat lagi'}
				</Button>
			{/if}
			<Dialog.Footer>
				<Dialog.Close>
					{#snippet child({ props })}
						<Button type="button" variant="ghost" {...props}>Tutup</Button>
					{/snippet}
				</Dialog.Close>
			</Dialog.Footer>
		</Dialog.Content>
	{/if}
</Dialog.Root>
