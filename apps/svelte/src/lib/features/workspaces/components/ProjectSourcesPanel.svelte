<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import * as Select from '@aqsha/ui-svelte/components/select';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Icon, MoreHorizontalIcon } from '$lib/icons';
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '@aqsha/ui-svelte/utils';
	import {
		useAssignCitationSection,
		useUnlinkCitation,
		useWorkspaceCitations
	} from '$lib/features/citations/api';
	import { citationMetaLine, type CitationAuthor } from '$lib/features/citations/types';
	import type { WorkspaceSection } from '../types';

	/**
	 * Koleksi sumber proyek: item perpustakaan akun yang di-link ke proyek ini
	 * (+ opsional ditandai untuk satu bab). Kelola perpustakaan penuh = /app/library.
	 */
	let {
		workspaceId,
		sections
	}: { workspaceId: string; sections: WorkspaceSection[] } = $props();

	const linked = useWorkspaceCitations(() => workspaceId);
	const unlink = useUnlinkCitation();
	const assignSection = useAssignCitationSection();

	const NO_SECTION = '__none__';
	const sectionOptions = $derived(sections.filter((s) => s.role !== 'bibliography'));
	const items = $derived(linked.data?.items ?? []);

	// `useWorkspaceCitations` returns the raw `citations` row shape (`authorsJson`), not the
	// library's mapped `authors` field that `citationMetaLine` expects — adapt locally.
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

<div class={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto', panelBodyPaddingClass)}>
	{#if linked.isPending}
		<div class="flex flex-1 items-center justify-center gap-2 py-10 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Memuat sumber…</span>
		</div>
	{:else if items.length === 0}
		<div
			class="rounded-md border-2 border-dashed border-border p-6 text-center text-sm text-muted-foreground"
		>
			Belum ada sumber di proyek ini. Simpan dari Jelajah atau perpustakaanmu.
		</div>
	{:else}
		<ul class="grid gap-2">
			{#each items as item (item.linkId)}
				<li class="grid gap-1.5 rounded-md border-2 border-border bg-card p-3">
					<p class="text-sm font-medium leading-snug">{item.title}</p>
					<p class="text-label text-muted-foreground">{metaLine(item)}</p>
					<div class="flex items-center gap-2">
						{#if sectionOptions.length > 0}
							<Select.Root
								type="single"
								value={item.sectionId ?? NO_SECTION}
								onValueChange={(v) =>
									assignSection.mutate({
										linkId: item.linkId,
										workspaceId,
										sectionId: v === NO_SECTION ? null : v
									})}
							>
								<Select.Trigger class="h-7 flex-1 text-label" aria-label="Tandai untuk bab">
									{sectionOptions.find((s) => s.id === item.sectionId)?.title ?? 'Seluruh proyek'}
								</Select.Trigger>
								<Select.Content>
									<Select.Item value={NO_SECTION} label="Seluruh proyek" />
									{#each sectionOptions as s (s.id)}
										<Select.Item value={s.id} label={s.title} />
									{/each}
								</Select.Content>
							</Select.Root>
						{/if}
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button
										{...props}
										type="button"
										variant="ghost"
										size="icon"
										class="size-7"
										aria-label={`Aksi ${item.title}`}
									>
										<Icon icon={MoreHorizontalIcon} class="size-4" />
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								<DropdownMenu.Item
									variant="destructive"
									onSelect={() => unlink.mutate({ workspaceId, citationId: item.id })}
								>
									Lepas dari proyek
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
