<script lang="ts">
	import { COVER_GRADIENTS, firstInitial, hashIndex } from './generative-cover';

	let {
		title,
		label,
		openAccess = false
	}: { title: string; label: string; openAccess?: boolean } = $props();

	const initial = $derived(firstInitial(title));
	const gradient = $derived(COVER_GRADIENTS[hashIndex(title, COVER_GRADIENTS.length)]);
</script>

<div class="absolute inset-0 flex flex-col justify-end p-3 text-white" style:background={gradient}>
	<span
		aria-hidden="true"
		class="font-heading pointer-events-none absolute -top-7 right-1 select-none text-[150px] font-black leading-none text-white/15"
	>
		{initial}
	</span>
	<div class="relative flex items-center gap-1.5">
		<span
			class="rounded-full bg-white/90 px-2 py-0.5 text-[10.5px] font-bold tracking-wide text-zinc-900"
		>
			{label}
		</span>
		{#if openAccess}
			<span
				class="rounded-full bg-black/35 px-2 py-0.5 text-[10.5px] font-semibold text-white backdrop-blur-sm"
			>
				Open access
			</span>
		{/if}
	</div>
</div>
