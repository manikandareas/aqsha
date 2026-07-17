<script lang="ts">
	import { page } from '$app/state';

	const sectionId = $derived(page.params.sectionId!);
</script>

<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
	<p>Memuat bab {sectionId}…</p>
</div>
