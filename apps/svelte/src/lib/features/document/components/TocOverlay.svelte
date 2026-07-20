<script lang="ts">
	import * as Popover from '@aqsha/ui-svelte/components/popover';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, BookOpenIcon } from '$lib/icons';
	import type { DocumentOutlineEntry } from '../lib/outline';

	/**
	 * Overlay daftar bab mengambang di atas preview — rumah navigasi dokumen. Klik bab → `onNavigate`
	 * (pemanggil menggulir preview + editor ke heading itu). Manajemen bab (tambah/reorder/rename)
	 * menyusul di iterasi berikut.
	 */
	let {
		outline,
		onNavigate
	}: {
		outline: DocumentOutlineEntry[];
		onNavigate: (entry: DocumentOutlineEntry) => void;
	} = $props();

	let open = $state(false);

	function navigate(entry: DocumentOutlineEntry): void {
		onNavigate(entry);
		open = false;
	}
</script>

<div class="absolute right-4 top-4 z-30">
	<Popover.Root bind:open>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					type="button"
					variant="outline"
					size="sm"
					class="gap-1.5 bg-card"
					aria-label="Daftar bab"
				>
					<Icon icon={BookOpenIcon} class="size-4" />
					Daftar bab
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="end" class="w-72 max-w-[calc(100vw-2rem)] p-2">
			<p class="px-2 pb-1.5 pt-1 text-micro uppercase text-muted-foreground">Bab</p>
			{#if outline.length === 0}
				<p class="px-2 py-3 text-sm text-muted-foreground">
					Belum ada bab. Tambahkan heading <code class="font-mono">= Judul</code> di editor.
				</p>
			{:else}
				<ul class="grid max-h-[60svh] gap-0.5 overflow-y-auto">
					{#each outline as entry (entry.sourceLine)}
						<li>
							<button
								type="button"
								class="w-full truncate rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
								onclick={() => navigate(entry)}
							>
								{entry.title}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		</Popover.Content>
	</Popover.Root>
</div>
