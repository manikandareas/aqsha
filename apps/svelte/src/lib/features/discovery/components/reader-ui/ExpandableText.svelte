<script lang="ts">
	import { Icon, ChevronDownIcon } from '$lib/icons';
	import { cn } from '$lib/utils';

	// Easing fisik (spring-out) dipakai konsisten untuk semua transisi interaktif.
	const EASE = 'ease-[cubic-bezier(0.32,0.72,0,1)]';

	/**
	 * Teks panjang yang bisa dilipat ("Baca selengkapnya"). Clamp via inline style supaya
	 * jumlah baris dinamis tetap ke-render (Tailwind JIT tak menangkap class dinamis).
	 */
	let {
		text,
		clampLines = 8,
		expandLabel = 'Baca selengkapnya',
		collapseLabel = 'Tampilkan ringkas',
		class: className
	}: {
		text: string;
		clampLines?: number;
		expandLabel?: string;
		collapseLabel?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	// Heuristik: hanya tampilkan toggle bila teks cukup panjang untuk terpotong.
	const isLong = $derived(text.length > clampLines * 64);
	const clampStyle = $derived(
		!open && isLong
			? `display:-webkit-box;-webkit-line-clamp:${clampLines};-webkit-box-orient:vertical;overflow:hidden`
			: undefined
	);
</script>

<div>
	<p
		class={cn('whitespace-pre-line text-[15px] leading-[1.75] text-ink-soft', className)}
		style={clampStyle}
	>
		{text}
	</p>
	{#if isLong}
		<button
			type="button"
			onclick={() => (open = !open)}
			class={cn(
				'mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground/90 transition-colors duration-300 hover:text-foreground',
				EASE
			)}
		>
			{open ? collapseLabel : expandLabel}
			<Icon
				icon={ChevronDownIcon}
				class={cn('size-3.5 transition-transform duration-300', EASE, open && 'rotate-180')}
			/>
		</button>
	{/if}
</div>
