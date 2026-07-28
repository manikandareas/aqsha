<script lang="ts">
	import { reveal, revealFade, revealUp } from '$lib/motion';
	import CountUp from './CountUp.svelte';
	import LedgerRow from './LedgerRow.svelte';

	const comparisonRows = [
		{
			problem: 'Ngasih sumber yang ternyata nggak ada',
			others: 'Perplexity, ChatGPT: sering ngarang referensi',
			aqsha: 'Tiap sumber dicek ke paper aslinya'
		},
		{
			problem: 'Kutipan nggak nyambung sama isi paper',
			others: 'AI lain: asal tempel kutipan',
			aqsha: 'Kalimatnya dicocokin ke isi aslinya'
		},
		{
			problem: 'Tiba-tiba ditagih, susah berhenti langganan',
			others: 'SciSpace: dikeluhkan auto-perpanjang & tagihan kejutan',
			aqsha: 'Harga jelas, batal kapan aja'
		},
		{
			problem: 'Limit dipangkas diam-diam',
			others: 'Perplexity: deep research dipotong dari 600/hari jadi 20/bulan',
			aqsha: 'Batas pemakaian jelas di depan'
		},
		{
			problem: 'Jawabannya dangkal, cuma permukaan',
			others: 'AI lain: rangkuman cepat tapi seadanya',
			aqsha: 'Bantu gali lebih dalam, kamu tetap yang mikir'
		},
		{
			problem: 'Tulisan jujurmu malah dicap "buatan AI"',
			others: 'Tanpa Aqsha: nggak ada bukti buat membela diri',
			aqsha: 'Nyimpen jejak proses nulismu sebagai bukti'
		}
	] as const;

	const stats = [
		{
			value: 40,
			suffix: '%',
			label: 'sumber AI lain yang nggak nyambung, menurut laporan pengguna'
		},
		{ value: 100, suffix: '%', label: 'sumber Aqsha dicek ke paper aslinya' },
		{ value: 6, suffix: '', label: 'masalah umum yang beres di Aqsha' }
	] as const;

	const quotes = [
		{
			text: 'When using Perplexity, I am finding that almost all of the sources are not true. It will give me a quote from a source, I click on the source and the quote is not part of it.',
			attribution: 'pengguna, komunitas riset',
			tilt: -1.2
		},
		{
			text: 'Out of ten sources, four led nowhere — dead links, nonexistent books, actual scholars authoring papers they never wrote.',
			attribution: 'pengguna, komunitas riset',
			tilt: 1
		}
	] as const;

	const revealOnce = reveal();
</script>

{#snippet pinnedQuote(quote: (typeof quotes)[number])}
	<!-- Printout ditempel ke papan: bg-background di atas band bg-card, paper-grain, resting tilt +
	     tape strip. Wrapper mereveal (fade+rise), blockquote menahan rotate agar tak bentrok transform. -->
	<div class={revealUp} {@attach revealOnce}>
		<blockquote
			class="relative border border-border bg-background px-7 py-8 sm:px-9 sm:py-10"
			style:transform="rotate({quote.tilt}deg)"
		>
			<div class="paper-grain pointer-events-none absolute inset-0"></div>
			<span
				aria-hidden="true"
				class="absolute -top-3 left-1/2 h-6 w-20 -translate-x-1/2 rotate-[-2deg] border border-foreground/10 bg-foreground/10"
			></span>
			<p
				class="font-heading text-pretty text-xl font-normal leading-[1.25] tracking-normal text-foreground sm:text-2xl sm:leading-[1.2]"
			>
				&ldquo;{quote.text}&rdquo;
			</p>
			<footer class="mt-5 font-mono text-xs text-muted-foreground sm:mt-6">
				— {quote.attribution}
			</footer>
		</blockquote>
	</div>
{/snippet}

<section id="bandingin" class="w-full scroll-mt-[72px] bg-card py-28 sm:py-36 lg:py-44">
	<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
		<!-- Header: asymmetric two-column -->
		<div class="grid gap-6 lg:grid-cols-[7fr_5fr] lg:items-end lg:gap-x-20">
			<div>
				<p
					class="{revealUp} text-[15px] leading-snug text-muted-foreground sm:text-base"
					{@attach revealOnce}
				>
					Bandingin sendiri
				</p>
				<h2
					class="{revealUp} font-heading mt-3 max-w-[min(100%,38rem)] text-[2.5rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]"
					{@attach revealOnce}
				>
					Hal yang bikin pusing di tool lain — beres di Aqsha.
				</h2>
			</div>
			<p
				class="{revealFade} max-w-md text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug lg:pb-2"
				{@attach revealOnce}
			>
				Perplexity, ChatGPT, dan kawan-kawannya sering ngasih referensi palsu — judul yang nggak
				ada, kutipan yang nggak pernah ditulis. Ini bukan kami yang ngomong: keluhan ini datang dari
				penggunanya sendiri.
			</p>
		</div>

		<!-- Stats strip: giant numerals across the band -->
		<div
			class="{revealUp} mt-16 grid gap-x-10 gap-y-10 border-t border-border pt-10 sm:mt-20 sm:grid-cols-3 sm:pt-12"
			{@attach revealOnce}
		>
			{#each stats as stat (stat.label)}
				<div>
					<span
						class="font-heading block text-6xl font-normal leading-none text-foreground sm:text-7xl lg:text-8xl"
					>
						<CountUp to={stat.value} suffix={stat.suffix} />
					</span>
					<p class="mt-4 max-w-[17rem] text-sm leading-snug text-muted-foreground sm:text-[15px]">
						{stat.label}
					</p>
				</div>
			{/each}
		</div>

		<!-- Quotes: printouts taped to the board -->
		<div class="mt-20 grid gap-8 sm:mt-24 lg:grid-cols-2 lg:gap-12">
			{#each quotes as quote (quote.text.slice(0, 40))}
				{@render pinnedQuote(quote)}
			{/each}
		</div>

		<!-- Comparison ledger -->
		<div class="{revealFade} mt-20 sm:mt-24" {@attach revealOnce}>
			<div
				class="hidden border-b border-foreground/40 pb-3 sm:grid sm:grid-cols-[3rem_1fr_1fr] sm:gap-x-8"
			>
				<span aria-hidden="true" class="font-mono text-xs text-muted-foreground/60">no</span>
				<p class="text-sm text-muted-foreground">Di tool lain</p>
				<p class="text-sm font-medium text-foreground">Di Aqsha</p>
			</div>
			<p class="border-b border-foreground/40 pb-3 text-sm text-muted-foreground sm:hidden">
				Di mana masalahnya muncul
			</p>
			{#each comparisonRows as row, index (row.problem)}
				<LedgerRow {row} {index} />
			{/each}
		</div>

		<!-- Disclaimer -->
		<p
			class="{revealFade} mt-10 max-w-2xl text-xs leading-relaxed text-muted-foreground sm:mt-12 sm:text-[13px]"
			{@attach revealOnce}
		>
			Berdasarkan keluhan publik pengguna riset di komunitas seperti Reddit (2024–2025), dari 880
			sinyal pada 80 thread. Nama produk lain adalah milik masing-masing pemiliknya; perbandingan
			dibuat untuk menggambarkan keluhan umum, bukan klaim mutlak.
		</p>
	</div>
</section>
