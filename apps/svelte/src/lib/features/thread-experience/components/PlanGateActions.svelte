<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';

	let {
		onApprove,
		onDecline
	}: {
		onApprove: () => void;
		onDecline: () => void;
	} = $props();
</script>

<div class="flex gap-2">
	<Button size="sm" onclick={onApprove}>Setujui</Button>
	<Button size="sm" variant="ghost" onclick={onDecline}>Tolak</Button>
</div>
