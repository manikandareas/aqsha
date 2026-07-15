<script lang="ts">
	// Shared step heading (title + subtitle).
	let { title, subtitle }: { title: string; subtitle: string } = $props();
</script>

<div class="mb-6">
	<h1 class="font-heading text-2xl font-bold tracking-tight text-foreground sm:text-[1.75rem]">
		{title}
	</h1>
	<p class="mt-2 text-[15px] leading-relaxed text-muted-foreground">{subtitle}</p>
</div>
