<script lang="ts">
	import { page } from '$app/state';

	const projectId = $derived(page.params.projectId!);
</script>

<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
	<p>Memuat proyek {projectId}…</p>
</div>
