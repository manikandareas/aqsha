<script lang="ts">
	import type { TopContributorsBlock } from '@aqsha/chat-core/deep-viz';
	import { Icon, BookOpenIcon, UsersRoundIcon, type IconSvgElement } from '$lib/icons';
	import type { SourceCardData } from '$lib/features/threads/lib/timeline-types';
	import PaperPills from './PaperPills.svelte';

	/**
	 * Kontributor teratas (ala Consensus): tabel Tipe | Nama | Paper — kolom tipe di-rowspan per
	 * grup (ikon + label "Author"/"Jurnal"), nama jurnal italic, kolom paper = chip `[n]` (resolve
	 * peta sitasi, `+n lagi` bila > 3). Pemisah baris hairline; header hairline lebih tegas.
	 */
	let {
		block,
		citations
	}: { block: TopContributorsBlock; citations?: Map<number, SourceCardData[]> } = $props();

	type Group = {
		label: string;
		icon: IconSvgElement;
		rows: Array<{ name: string; papers: number[] }>;
		italic: boolean;
	};

	const groups = $derived(
		(
			[
				{ label: 'Author', icon: UsersRoundIcon, rows: block.authors, italic: false },
				{ label: 'Jurnal', icon: BookOpenIcon, rows: block.venues, italic: true }
			] satisfies Group[]
		).filter((group) => group.rows.length > 0)
	);
</script>

<div class="min-w-0 overflow-x-auto">
	<table class="w-full min-w-[480px] border-collapse text-left text-[13px]">
		<thead>
			<tr class="border-b text-[12px] text-foreground">
				<th class="w-[26%] py-2.5 pr-3 font-semibold">Tipe</th>
				<th class="w-[34%] py-2.5 pr-3 font-semibold">Nama</th>
				<th class="py-2.5 font-semibold">Paper</th>
			</tr>
		</thead>
		<tbody>
			{#each groups as group (group.label)}
				{#each group.rows as row, i (row.name)}
					<tr class="border-b border-border/60 last:border-b-0">
						{#if i === 0}
							<th
								scope="rowgroup"
								rowspan={group.rows.length}
								class="py-3.5 pr-3 align-top font-medium text-foreground"
							>
								<span class="inline-flex items-center gap-2">
									<Icon icon={group.icon} class="size-4 text-muted-foreground" />
									{group.label}
								</span>
							</th>
						{/if}
						<td class={`py-3.5 pr-3 align-middle ${group.italic ? 'italic' : ''}`}>
							<span class="block break-words text-foreground">{row.name}</span>
						</td>
						<td class="py-3.5 align-middle">
							<PaperPills papers={row.papers} {citations} />
						</td>
					</tr>
				{/each}
			{/each}
		</tbody>
	</table>
</div>
