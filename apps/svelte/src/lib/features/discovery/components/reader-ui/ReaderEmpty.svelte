<script lang="ts">
	import { Icon, ImageIcon } from '$lib/icons';

	let { title, message }: { title: string; message: string } = $props();
</script>

<div
	class="mx-auto mt-12 max-w-sm rounded-3xl border border-border/70 bg-muted/20 px-6 py-12 text-center"
>
	<div
		class="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
	>
		<Icon icon={ImageIcon} class="size-5" />
	</div>
	<h2 class="font-serif text-xl text-foreground">{title}</h2>
	<p class="mx-auto mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">{message}</p>
</div>
