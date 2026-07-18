<script lang="ts">
	import { Spinner } from '$lib/components/ui/spinner';
	import { useWorkspaceBibliography } from '../api';

	/** Daftar pustaka proyek — digenerate citeproc dari sitasi terpakai di bab-bab; read-only. */
	let { workspaceId }: { workspaceId: string } = $props();

	const bibliography = useWorkspaceBibliography(() => workspaceId);
</script>

<div
	class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-lg border-2 border-border bg-card p-8"
>
	{#if bibliography.isPending}
		<div class="flex items-center justify-center gap-2 py-12 text-muted-foreground">
			<Spinner class="size-4" />
			<span class="text-sm">Menyusun daftar pustaka…</span>
		</div>
	{:else if (bibliography.data?.entries ?? []).length === 0}
		<p class="py-12 text-center text-sm text-muted-foreground">
			Belum ada sitasi yang terpakai di bab-bab. Sisipkan sitasi dari editor bab, daftar pustaka
			tersusun otomatis di sini.
		</p>
	{:else}
		<p class="text-label text-muted-foreground">
			Tersusun otomatis dari sitasi yang terpakai — selalu sinkron dengan isi bab.
		</p>
		<ol class="grid gap-3">
			{#each bibliography.data?.entries ?? [] as entry (entry.id)}
				<li class="text-sm leading-relaxed">{entry.text}</li>
			{/each}
		</ol>
	{/if}
</div>
