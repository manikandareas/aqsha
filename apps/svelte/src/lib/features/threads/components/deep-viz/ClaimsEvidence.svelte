<script lang="ts">
	import type { ClaimsEvidenceBlock } from '@aqsha/chat-core/deep-viz';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import { CLAIM_COLORS, CLAIM_LABELS, CLAIM_TRACK_COLORS } from './labels';
	import PaperPills from './PaperPills.svelte';

	/**
	 * Tabel klaim & bukti (ala Consensus): 4 kolom Klaim | Kekuatan bukti | Alasan | Paper.
	 * Meter kekuatan = 10 batang vertikal; terisi = warna label (skor DETERMINISTIK builder
	 * chat-core — bukan tulisan LLM), track = step lebih terang ramp yang sama; label teks di
	 * bawah meter (kekuatan tak pernah color-alone). Wrapper `overflow-x-auto` (mobile).
	 */
	let {
		block,
		citations
	}: { block: ClaimsEvidenceBlock; citations?: Map<number, SourceCardData[]> } = $props();

	type ClaimLabel = ClaimsEvidenceBlock['claims'][number]['label'];
</script>

<!-- Meter 10 batang vertikal: terisi = round(score); label teks di bawah (bukan color-alone). -->
{#snippet strengthMeter(score: number, label: ClaimLabel)}
	{@const filled = Math.round(Math.min(10, Math.max(0, score)))}
	<div class="grid gap-1.5" title={`Skor ${score} dari 10`}>
		<div
			class="flex items-end gap-[3px]"
			role="img"
			aria-label={`Kekuatan bukti ${CLAIM_LABELS[label]} (skor ${score} dari 10)`}
		>
			{#each [...Array(10).keys()] as i (i)}
				<span
					class="h-4 w-[5px] rounded-full"
					style={`background: ${i < filled ? CLAIM_COLORS[label] : CLAIM_TRACK_COLORS[label]}`}
				></span>
			{/each}
		</div>
		<span class="text-[11px] text-muted-foreground leading-4">{CLAIM_LABELS[label]}</span>
	</div>
{/snippet}

<div class="min-w-0 overflow-x-auto">
	<table class="w-full min-w-[620px] border-collapse text-left text-[12.5px]">
		<thead>
			<tr class="border-b text-[12px] text-foreground">
				<th class="w-[28%] py-2.5 pr-4 font-semibold">Klaim</th>
				<th class="w-[19%] py-2.5 pr-4 font-semibold">Kekuatan bukti</th>
				<th class="w-[33%] py-2.5 pr-4 font-semibold">Alasan</th>
				<th class="py-2.5 font-semibold">Paper</th>
			</tr>
		</thead>
		<tbody>
			{#each block.claims as claim, i (`${i}-${claim.text.slice(0, 24)}`)}
				<tr class="border-b border-border/60 align-top last:border-b-0">
					<td class="py-4 pr-4">
						<p class="break-words font-medium text-foreground leading-5">{claim.text}</p>
					</td>
					<td class="py-4 pr-4">
						{@render strengthMeter(claim.score, claim.label)}
					</td>
					<td class="py-4 pr-4">
						<p class="break-words text-muted-foreground leading-5">{claim.reasoning}</p>
					</td>
					<td class="py-4">
						<PaperPills papers={claim.papers} {citations} />
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
