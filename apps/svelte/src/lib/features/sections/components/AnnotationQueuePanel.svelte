<script lang="ts">
	import { Badge } from '@aqsha/ui-svelte/components/badge';
	import { Checkbox } from '@aqsha/ui-svelte/components/checkbox';
	import { Icon, EyeIcon, XIcon, Trash2Icon } from '$lib/icons';
	import type { AnnotationView } from '../api';

	/**
	 * Antrian anotasi bab: sorotan/pin terbuka + terkirim. Checkbox hanya untuk yang `open`
	 * (dipilih untuk ikut pesan berikutnya); `sent` tampil redup; `sourceVersion` beda dari
	 * versi sumber terkini → badge "basi". `resolved`/`dismissed` disembunyikan.
	 */
	let {
		annotations,
		selectedIds,
		currentVersion,
		onToggle,
		onDismiss,
		onDelete,
		onFocus
	}: {
		annotations: AnnotationView[];
		selectedIds: Set<string>;
		currentVersion: number;
		onToggle: (id: string) => void;
		onDismiss: (id: string) => void;
		onDelete: (id: string) => void;
		onFocus: (id: string) => void;
	} = $props();

	const visible = $derived(annotations.filter((a) => a.status === 'open' || a.status === 'sent'));
</script>

{#if visible.length === 0}
	<p class="px-1 py-4 text-center text-label text-muted-foreground">
		Tandai teks di PDF untuk membuat anotasi.
	</p>
{:else}
	<ul class="flex flex-col gap-2">
		{#each visible as annotation (annotation.id)}
			<li
				class="flex flex-col gap-1.5 rounded-md border-2 border-border bg-card p-2.5 {annotation.status ===
				'sent'
					? 'opacity-60'
					: ''}"
			>
				<div class="flex items-center gap-2">
					{#if annotation.status === 'open'}
						<Checkbox
							checked={selectedIds.has(annotation.id)}
							onCheckedChange={() => onToggle(annotation.id)}
							aria-label="Pilih anotasi untuk dikirim"
						/>
					{/if}
					<Badge variant="outline">{annotation.kind === 'pin' ? 'pin' : 'sorotan'}</Badge>
					<span class="text-micro text-muted-foreground">hal. {annotation.page}</span>
					{#if annotation.sourceVersion !== currentVersion}
						<Badge variant="outline">basi</Badge>
					{/if}
					{#if annotation.status === 'sent'}
						<span class="text-micro text-muted-foreground">terkirim</span>
					{/if}
					<div class="ml-auto flex items-center gap-0.5">
						<button
							type="button"
							class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="Sorot di PDF"
							title="Sorot di PDF"
							onclick={() => onFocus(annotation.id)}
						>
							<Icon icon={EyeIcon} class="size-3.5" />
						</button>
						<button
							type="button"
							class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="Sembunyikan anotasi"
							title="Sembunyikan"
							onclick={() => onDismiss(annotation.id)}
						>
							<Icon icon={XIcon} class="size-3.5" />
						</button>
						<button
							type="button"
							class="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
							aria-label="Hapus anotasi"
							title="Hapus"
							onclick={() => onDelete(annotation.id)}
						>
							<Icon icon={Trash2Icon} class="size-3.5" />
						</button>
					</div>
				</div>
				{#if annotation.selectedText}
					<p class="line-clamp-2 text-label text-foreground">“{annotation.selectedText}”</p>
				{/if}
				{#if annotation.note}
					<p class="line-clamp-2 text-label text-muted-foreground">{annotation.note}</p>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
