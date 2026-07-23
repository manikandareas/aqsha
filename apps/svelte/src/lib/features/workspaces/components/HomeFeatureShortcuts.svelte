<script lang="ts">
	import { resolve } from '$app/paths';
	import {
		Icon,
		ArrowUpRightIcon,
		BookOpenIcon,
		TrendingUpIcon,
		type IconSvgElement
	} from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';

	type Shortcut = {
		route: '/app/(product)/explore' | '/app/(product)/library';
		label: string;
		description: string;
		icon: IconSvgElement;
	};

	/** Soft primary well — ikon + bg satu nuansa emerald, bukan mint/lavender terpisah. */
	const ICON_WELL = 'border-primary/30 bg-primary/12 text-primary';

	/** Pintu masuk ringkas ke Jelajahi dan Perpustakaan. */
	const shortcuts: Shortcut[] = [
		{
			route: '/app/(product)/explore',
			label: 'Jelajahi',
			description: 'Temukan paper & topik yang relevan.',
			icon: TrendingUpIcon
		},
		{
			route: '/app/(product)/library',
			label: 'Perpustakaan',
			description: 'Sumbermu, siap disitasi ke proyek.',
			icon: BookOpenIcon
		}
	];
</script>

<nav
	aria-label="Fitur utama"
	class="flex w-full flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-stretch"
>
	{#each shortcuts as shortcut (shortcut.route)}
		<a
			href={resolve(shortcut.route)}
			class={cn(
				'group relative flex min-h-14 max-w-full flex-1 items-center gap-3 rounded-xl border-2 border-transparent px-3 py-2.5',
				'transition-[background-color,border-color] duration-150 ease-out',
				'hover:border-border hover:bg-card/55',
				'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'focus-visible:border-ring'
			)}
		>
			<span
				class={cn(
					'mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg border-2',
					'transition-colors duration-150 ease-out group-hover:border-primary/45 group-hover:bg-primary/18',
					ICON_WELL
				)}
				aria-hidden="true"
			>
				<Icon icon={shortcut.icon} class="size-4" />
			</span>
			<span class="min-w-0 flex-1">
				<span class="flex items-center gap-1.5">
					<span class="text-control font-semibold text-foreground">
						{shortcut.label}
					</span>
					<Icon
						icon={ArrowUpRightIcon}
						class={cn(
							'size-3.5 text-muted-foreground/70 transition-[transform,color,opacity] duration-150',
							'opacity-60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-100 group-hover:text-primary',
							'motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0'
						)}
					/>
				</span>
				<span class="mt-0.5 block text-label leading-snug text-muted-foreground">
					{shortcut.description}
				</span>
			</span>
		</a>
	{/each}
</nav>
