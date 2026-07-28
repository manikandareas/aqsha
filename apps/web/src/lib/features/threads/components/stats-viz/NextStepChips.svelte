<script lang="ts">
	import { Icon, ArrowRightIcon } from '$lib/icons';
	import { statsNextStepsFor } from '../../lib/stats-next-steps';
	import { getComposerMentions } from '../../state/composer-mentions.svelte';

	/**
	 * Chip next-step ritual — tuntunan urutan uji SKILL.md, dirender di bawah transkrip HANYA pada run
	 * analisis TERAKHIR + turn settled (lihat `MessageList`). Tap = prefill composer via
	 * `getComposerMentions().setComposerDraft` (channel `ComposerMentions`), TANPA auto-send.
	 * Uji tanpa saran (custom / Tier 3) → `statsNextStepsFor` kosong → tak render apa pun.
	 */
	let { analysis }: { analysis: string } = $props();

	const steps = $derived(statsNextStepsFor(analysis));
	const mentions = getComposerMentions();
</script>

{#if steps.length > 0}
	<div class="flex flex-wrap items-center gap-1.5 pt-0.5">
		<span class="text-[11px] text-muted-foreground">Langkah berikutnya</span>
		{#each steps as step (step.label)}
			<button
				type="button"
				onclick={() => mentions.setComposerDraft(step.prompt)}
				class="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 font-medium text-[11px] text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				title={step.prompt}
			>
				{step.label}
				<Icon icon={ArrowRightIcon} class="size-3" />
			</button>
		{/each}
	</div>
{/if}
