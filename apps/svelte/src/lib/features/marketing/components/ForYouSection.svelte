<script lang="ts">
	import { reveal, revealUp } from '$lib/motion';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { PUBLIC_PLAN_KEYS } from '$lib/plan/catalog';
	import type { Billing } from '../pricing';
	import PlanReceipt from './PlanReceipt.svelte';

	const personas = [
		{
			title: 'Mahasiswa S1',
			sub: 'Anak skripsi',
			body: 'Nyusun bab dan daftar pustaka dengan sumber yang beneran ada — aman pas sidang.'
		},
		{
			title: 'Pascasarjana',
			sub: 'Tesis & disertasi',
			body: 'Ngatur ratusan referensi tanpa takut ada kutipan yang salah atau dipelintir.'
		},
		{
			title: 'Peneliti',
			sub: 'Paper & review jurnal',
			body: 'Lebih cepat nyusun tinjauan pustaka, tiap klaim tetap kekunci ke sumbernya.'
		}
	] as const;

	/** Resting tilt per receipt — a row of struk laid loosely on the counter. */
	const receiptTilts = [-1.1, 0.9, -0.7, 1.2] as const;

	const pricingPills = [
		'Mulai gratis',
		'Tagihan jelas',
		'Batal kapan aja',
		'Buka di browser'
	] as const;

	let billing = $state<Billing>('monthly');

	const revealOnce = reveal();
</script>

<section id="buat-siapa" class="w-full scroll-mt-[72px] bg-background py-24 sm:py-32 lg:py-40">
	<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="{revealUp} mb-14 max-w-2xl sm:mb-20" {@attach revealOnce}>
			<p class="text-[15px] leading-snug text-muted-foreground sm:text-base">Buat siapa</p>
			<h2
				class="font-heading mt-3 text-[2.5rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]"
			>
				Nemenin kamu di tahap yang paling rawan salah.
			</h2>
			<p
				class="mt-5 max-w-xl text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug"
			>
				Dari kalimat pertama skripsi sampai paper dikirim.
			</p>
		</div>

		<!-- Personas — editorial columns, no cards -->
		<div class="grid gap-y-10 sm:gap-x-10 lg:grid-cols-3 lg:gap-x-12">
			{#each personas as persona, index (persona.title)}
				<div
					class="{revealUp} border-l border-border pl-6"
					style:transition-delay="{index * 100}ms"
					{@attach revealOnce}
				>
					<p class="text-sm text-muted-foreground sm:text-[15px]">{persona.sub}</p>
					<h3
						class="font-heading mt-2 text-3xl font-normal leading-tight tracking-normal text-foreground"
					>
						{persona.title}
					</h3>
					<p
						class="mt-4 max-w-xs text-pretty text-sm leading-snug text-muted-foreground sm:text-base sm:leading-snug"
					>
						{persona.body}
					</p>
				</div>
			{/each}
		</div>

		<!-- Pricing: all plans visible as a row of receipts -->
		<div id="pricing" class="mt-24 scroll-mt-[72px] sm:mt-32 lg:mt-40">
			<div class="flex flex-wrap items-end justify-between gap-6">
				<div class="{revealUp} max-w-2xl" {@attach revealOnce}>
					<p class="text-[15px] leading-snug text-muted-foreground sm:text-base">Harga jujur</p>
					<h3
						class="font-heading mt-3 text-[2.25rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.5rem] sm:leading-[1.06] lg:text-[2.75rem] lg:leading-[1.05]"
					>
						Tanpa kejutan. Batal kapan aja.
					</h3>
					<p
						class="mt-5 text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug"
					>
						Aqsha jalan di browser — dibuka dari mana aja, kapan aja, tanpa instal apa-apa. Semua
						yang kamu bayar tercetak jelas di struknya.
					</p>
				</div>

				<!-- Billing toggle -->
				<div class="inline-flex rounded-full border border-border bg-muted/40 p-1">
					<button
						type="button"
						onclick={() => (billing = 'monthly')}
						class={cn(
							'rounded-full px-4 py-1.5 text-sm transition-colors',
							billing === 'monthly'
								? 'bg-foreground text-background'
								: 'text-muted-foreground hover:text-foreground'
						)}
						aria-pressed={billing === 'monthly'}
					>
						Bulanan
					</button>
					<button
						type="button"
						onclick={() => (billing = 'annual')}
						class={cn(
							'rounded-full px-4 py-1.5 text-sm transition-colors',
							billing === 'annual'
								? 'bg-foreground text-background'
								: 'text-muted-foreground hover:text-foreground'
						)}
						aria-pressed={billing === 'annual'}
					>
						Tahunan
					</button>
				</div>
			</div>

			<!-- Receipts -->
			<div class="mt-12 grid gap-6 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
				{#each PUBLIC_PLAN_KEYS as planKey, index (planKey)}
					<PlanReceipt
						{planKey}
						{billing}
						tilt={receiptTilts[index % receiptTilts.length] ?? 0}
						delay={index * 80}
					/>
				{/each}
			</div>

			<!-- Info pills -->
			<div class="mt-10 flex flex-wrap gap-2 sm:mt-12">
				{#each pricingPills as pill (pill)}
					<span
						class="rounded-full border border-border bg-muted/50 px-3.5 py-1.5 text-sm text-foreground"
					>
						{pill}
					</span>
				{/each}
			</div>
		</div>
	</div>
</section>
