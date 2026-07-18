<script lang="ts">
	import { diffLines } from 'diff';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Icon, SparklesIcon, AlertCircleIcon } from '$lib/icons';
	import type { PendingProposalView } from '../api';

	/**
	 * Kartu tinjau usulan suntingan Astra: diff unified sumber terkini → usulan + Terima/Tolak.
	 * Usulan basi (sumber berubah sejak dibuat) → hanya Tolak (accept CAS akan menolak menimpa).
	 */
	let {
		proposal,
		accepting,
		onAccept,
		onReject
	}: {
		proposal: NonNullable<PendingProposalView>;
		accepting: boolean;
		onAccept: () => void;
		onReject: () => void;
	} = $props();

	type DiffLine = { type: 'add' | 'del' | 'ctx'; text: string };
	const lines = $derived.by<DiffLine[]>(() => {
		const out: DiffLine[] = [];
		for (const part of diffLines(proposal.currentSource, proposal.proposedSource)) {
			const type = part.added ? 'add' : part.removed ? 'del' : 'ctx';
			const segments = part.value.split('\n');
			// diffLines menutup nilai dengan \n → buang baris kosong penutup, bukan baris asli.
			if (segments.length > 0 && segments[segments.length - 1] === '') segments.pop();
			for (const text of segments) out.push({ type, text });
		}
		return out;
	});
</script>

<div class="flex flex-col gap-3 rounded-lg border-2 border-border bg-card p-4">
	<div class="flex items-start gap-2">
		<Icon icon={SparklesIcon} class="mt-0.5 size-4 text-primary" />
		<div class="min-w-0 flex-1">
			<h2 class="font-heading text-base font-bold">Usulan suntingan Astra</h2>
			<p class="text-label text-muted-foreground">{proposal.summary}</p>
		</div>
	</div>

	{#if proposal.isStale}
		<div
			class="flex items-center gap-2 rounded-md border-2 border-border bg-muted/40 px-3 py-2 text-label text-muted-foreground"
		>
			<Icon icon={AlertCircleIcon} class="size-4 shrink-0" />
			Sumber berubah sejak usulan dibuat. Tolak lalu minta Astra menyusun ulang.
		</div>
	{/if}

	<div class="max-h-96 overflow-auto rounded-md border-2 border-border bg-background">
		<div class="min-w-max font-mono text-label leading-relaxed">
			{#each lines as line, i (i)}
				<div
					class="flex whitespace-pre px-2 {line.type === 'add'
						? 'bg-mint/20'
						: line.type === 'del'
							? 'bg-coral/20'
							: ''}"
				>
					<span class="mr-2 select-none text-muted-foreground"
						>{line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '}</span
					><span>{line.text}</span>
				</div>
			{/each}
		</div>
	</div>

	<div class="flex justify-end gap-2">
		<Button type="button" variant="outline" onclick={onReject}>Tolak</Button>
		<Button type="button" disabled={proposal.isStale || accepting} onclick={onAccept}>
			{#if accepting}
				<Spinner class="size-4" />
			{/if}
			Terima
		</Button>
	</div>
</div>
