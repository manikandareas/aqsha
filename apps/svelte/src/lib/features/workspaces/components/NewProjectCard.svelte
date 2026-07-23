<script lang="ts">
	import { resolve } from '$app/paths';
	import { Icon, PlusIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	/** Slot pertama grid: buat proyek baru — dashed + hover primary. */
	const href = resolve('/app/(product)/projects/new');
</script>

<a
	{href}
	class={cn(
		'group flex h-full min-h-[16rem] flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card/35 px-6 text-center',
		'text-muted-foreground transition-[border-color,background-color,color] duration-150 ease-out',
		'hover:border-primary hover:bg-primary/10 hover:text-primary',
		'focus-visible:border-primary focus-visible:bg-primary/10 focus-visible:text-primary',
		'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50'
	)}
>
	<span
		class="grid size-11 place-items-center rounded-lg border-2 border-current/25 bg-card/70 transition-colors duration-150 group-hover:border-current/40"
		aria-hidden="true"
	>
		<Icon icon={PlusIcon} class="size-5" />
	</span>
	<span class="mt-4 text-control font-semibold text-current">Proyek baru</span>
	<span class="mt-1 max-w-[22ch] text-label leading-relaxed text-muted-foreground">
		Mulai dari ide, judulnya bisa menyusul.
	</span>
</a>
