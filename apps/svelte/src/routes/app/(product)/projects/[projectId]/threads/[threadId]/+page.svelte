<script lang="ts">
	import { page } from '$app/state';

	const threadId = $derived(page.params.threadId!);
</script>

<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
	<p>Memuat thread {threadId}…</p>
</div>
