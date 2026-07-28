<script lang="ts">
	import { Icon, Loader2Icon } from '$lib/icons';
</script>

<!-- Fill the viewport so swapping in the (taller) article extends downward instead of jumping the top. -->
<div class="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
	<Icon icon={Loader2Icon} class="size-5 animate-spin" />
	<p class="text-[13px]">Menyiapkan bacaan…</p>
</div>
