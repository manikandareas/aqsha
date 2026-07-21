<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { getProposalReviewInteractions } from '../lib/proposal-review-interactions.svelte';

	let { proposalId, summary }: { proposalId: string; summary: string } = $props();

	const interactions = getProposalReviewInteractions();
	const current = $derived(interactions.current);
</script>

{#if current?.proposalId === proposalId}
	<div class="not-prose rounded-lg border-2 border-border bg-card p-3">
		<p class="text-sm font-medium">Usulan suntingan siap ditinjau</p>
		<p class="mt-1 text-label text-muted-foreground">{summary}</p>
		<Button class="mt-3" size="sm" onclick={() => current?.review()}>
			Tinjau usulan ({current?.hunkCount})
		</Button>
	</div>
{/if}
