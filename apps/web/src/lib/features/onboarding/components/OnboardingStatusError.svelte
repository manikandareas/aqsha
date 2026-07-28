<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';

	let { message, onretry }: { message: string; onretry: () => void } = $props();
</script>

<section class="mx-auto max-w-md text-center" role="alert" aria-live="assertive">
	<h1 class="font-heading text-3xl font-normal tracking-tight text-foreground">
		Kami belum bisa menyiapkan perjalananmu
	</h1>
	<p class="mt-3 text-sm leading-relaxed text-muted-foreground">{message}</p>
	<Button type="button" variant="outline" class="mt-6" onclick={onretry}>Coba lagi</Button>
</section>
