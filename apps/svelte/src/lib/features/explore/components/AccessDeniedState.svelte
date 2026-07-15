<script lang="ts">
	import { panelBodyPaddingClass } from '$lib/components/layout/panel-surface';
	import { cn } from '$lib/utils';
</script>

<div
	class={cn(
		'mx-auto grid w-full max-w-xl flex-1 place-items-center py-10 text-center',
		panelBodyPaddingClass
	)}
>
	<div class="grid gap-3">
		<h1 class="font-heading text-3xl font-bold leading-tight">Akses ditolak</h1>
		<p class="text-[14px] text-muted-foreground">
			Thread ini tidak tersedia atau bukan milik akun kamu.
		</p>
	</div>
</div>
