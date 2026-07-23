<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, BookOpenIcon, TrendingUpIcon, type IconSvgElement } from '$lib/icons';

	type Shortcut = {
		route: '/app/(product)/explore' | '/app/(product)/library';
		label: string;
		icon: IconSvgElement;
		iconClass: string;
	};

	/** Pintu masuk ringkas ke Jelajahi dan Perpustakaan. */
	const shortcuts: Shortcut[] = [
		{
			route: '/app/(product)/explore',
			label: 'Jelajahi',
			icon: TrendingUpIcon,
			iconClass:
				'border-lemon bg-lemon text-lemon-chip-ink btn-filled-gradient [--btn-face:var(--lemon)]'
		},
		{
			route: '/app/(product)/library',
			label: 'Perpustakaan',
			icon: BookOpenIcon,
			iconClass:
				'border-lavender bg-lavender text-white btn-filled-gradient [--btn-face:var(--lavender)] dark:border-lavender-strong dark:bg-lavender-strong dark:[--btn-face:var(--lavender-strong)]'
		}
	];
</script>

<nav aria-label="Fitur utama" class="flex flex-wrap items-center gap-2">
	{#each shortcuts as shortcut (shortcut.route)}
		<Button
			href={resolve(shortcut.route)}
			variant="outline"
			class="h-10 gap-2 rounded-full px-2.5 pr-3.5 text-control font-semibold"
		>
			<span
				class={`grid size-6 shrink-0 place-items-center rounded-full border ${shortcut.iconClass}`}
				aria-hidden="true"
			>
				<Icon icon={shortcut.icon} class="size-3.5" />
			</span>
			{shortcut.label}
		</Button>
	{/each}
</nav>
