<script lang="ts">
	import { fade } from 'svelte/transition';
	import { reveal, revealUp } from '$lib/motion';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { faqItems } from '../faq-data';

	// FAQ landing — konten SAMA dengan FAQPage JSON-LD (structured-data). Wajib visible + answer SELALU
	// di DOM (grid-rows 0fr↔1fr, bukan unmount) supaya crawler tetap baca. Signature "ghost index":
	// angka serif raksasa di margin kiri (lg) menampilkan nomor pertanyaan terbuka, crossfade. Toggle
	// morph plus→cross (dua garis 1px rotate 45°).
	let openIndex = $state<number | null>(0);

	const revealOnce = reveal();
</script>

<section id="faq" class="w-full scroll-mt-[72px] bg-background py-28 sm:py-36 lg:py-44">
	<div class="relative mx-auto w-full max-w-3xl px-4 sm:px-6">
		<!-- Header -->
		<div class="mb-12 sm:mb-16">
			<p
				class="{revealUp} text-[15px] leading-snug text-muted-foreground sm:text-base"
				{@attach revealOnce}
			>
				Masih ada yang ganjel?
			</p>
			<h2
				class="{revealUp} font-heading mt-3 text-[2.5rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3rem] lg:leading-[1.05]"
				{@attach revealOnce}
			>
				Pertanyaan yang sering muncul.
			</h2>
			<p class="font-hand mt-6 text-lg text-foreground/60 sm:text-xl">
				masih ada yang mau ditanya?
			</p>
		</div>

		<!-- Ghost index — giant number of the open question, outside the column -->
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-y-0 right-full hidden w-28 lg:block"
		>
			<div class="sticky top-32 pr-8 text-right">
				{#if openIndex !== null}
					{#key openIndex}
						<span
							class="font-heading block text-8xl leading-none text-foreground/10"
							in:fade={{ duration: 300 }}
						>
							{String(openIndex + 1).padStart(2, '0')}
						</span>
					{/key}
				{/if}
			</div>
		</div>

		<!-- Accordion (smooth height, content stays in DOM) -->
		<div class="min-w-0">
			{#each faqItems as item, index (item.q)}
				{@const isOpen = openIndex === index}
				<div
					class="{revealUp} border-b border-border first:border-t"
					style:transition-delay="{index * 40}ms"
					{@attach revealOnce}
				>
					<button
						type="button"
						onclick={() => (openIndex = isOpen ? null : index)}
						class="flex w-full items-center justify-between gap-4 py-5 text-left text-base font-medium text-foreground transition-colors hover:text-foreground/80 sm:py-6 sm:text-lg"
						aria-expanded={isOpen}
					>
						{item.q}
						<!-- Plus → cross morph -->
						<span
							aria-hidden="true"
							class={cn(
								'relative block size-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none',
								isOpen && 'rotate-45'
							)}
						>
							<span class="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-muted-foreground"
							></span>
							<span class="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-muted-foreground"
							></span>
						</span>
					</button>
					<div
						class="grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
						style:grid-template-rows={isOpen ? '1fr' : '0fr'}
						style:opacity={isOpen ? 1 : 0}
					>
						<div class="overflow-hidden">
							<p
								class="pb-5 pr-0 text-[15px] leading-relaxed text-muted-foreground sm:pb-6 sm:pr-8 sm:text-base"
							>
								{item.a}
							</p>
						</div>
					</div>
				</div>
			{/each}
		</div>
	</div>
</section>
