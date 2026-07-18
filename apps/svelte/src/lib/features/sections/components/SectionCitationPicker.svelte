<script lang="ts">
	import * as Dialog from '@aqsha/ui-svelte/components/dialog';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Input } from '@aqsha/ui-svelte/components/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { useWorkspaceCitations } from '$lib/features/citations/api';
	import { citationMetaLine, type CitationAuthor } from '$lib/features/citations/types';

	/** Pilih satu referensi dari koleksi proyek untuk disisipkan sebagai sitasi di bab ini. */
	let {
		open,
		onOpenChange,
		workspaceId,
		onPick
	}: {
		open: boolean;
		onOpenChange: (open: boolean) => void;
		workspaceId: string;
		onPick: (citation: { id: string; title: string }) => void;
	} = $props();

	let q = $state('');
	const linked = useWorkspaceCitations(
		() => workspaceId,
		() => open
	);
	const items = $derived(
		(linked.data?.items ?? []).filter(
			(i) => !q.trim() || i.title.toLowerCase().includes(q.trim().toLowerCase())
		)
	);

	// `useWorkspaceCitations` returns the raw `citations` row shape (`authorsJson`), not the
	// library's mapped `authors` field that `citationMetaLine` expects — adapt locally, same as
	// `ProjectSourcesPanel`.
	function metaLine(item: {
		authorsJson: CitationAuthor[];
		publishedYear: number | null;
		venue: string | null;
	}) {
		return citationMetaLine({
			authors: item.authorsJson,
			publishedYear: item.publishedYear,
			venue: item.venue
		});
	}
</script>

<Dialog.Root {open} {onOpenChange}>
	{#if open}
		<Dialog.Content class="sm:max-w-lg">
			<Dialog.Header>
				<Dialog.Title>Sisipkan sitasi</Dialog.Title>
				<Dialog.Description>
					Dari koleksi proyek ini — tambah sumber baru lewat panel Sumber.
				</Dialog.Description>
			</Dialog.Header>
			<Input bind:value={q} placeholder="Cari di koleksi proyek…" aria-label="Cari referensi" />
			<div class="max-h-80 min-h-0 overflow-y-auto">
				{#if linked.isPending}
					<div class="flex items-center justify-center gap-2 py-8 text-muted-foreground">
						<Spinner class="size-4" />
						<span class="text-sm">Memuat…</span>
					</div>
				{:else if items.length === 0}
					<p class="py-8 text-center text-sm text-muted-foreground">
						{q
							? 'Tidak ada yang cocok.'
							: 'Koleksi proyek masih kosong — tambahkan dari panel Sumber.'}
					</p>
				{:else}
					<ul class="grid gap-1.5">
						{#each items as item (item.id)}
							<li
								class="flex items-center gap-3 rounded-md border-2 border-border bg-card px-3 py-2"
							>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{item.title}</p>
									<p class="truncate text-label text-muted-foreground">{metaLine(item)}</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onclick={() => {
										onPick({ id: item.id, title: item.title });
										onOpenChange(false);
									}}
								>
									Sisipkan
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</Dialog.Content>
	{/if}
</Dialog.Root>
