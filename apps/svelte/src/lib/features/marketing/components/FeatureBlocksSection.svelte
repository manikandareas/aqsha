<script lang="ts">
	import { reveal, revealFade, revealUp } from '$lib/motion';
	import { cn } from '$lib/utils';
	import FeatureFrame from './FeatureFrame.svelte';

	// Editorial frame art per feature block — sketchbook landscapes, satu gambar per blok.
	const FRAME_IMAGES = {
		workspace: '/landing/frame-workspace.png',
		astra: '/landing/frame-astra.png',
		citations: '/landing/frame-citations.png',
		provenance: '/landing/frame-provenance.png'
	} as const;

	type BlockCopy = {
		num: string;
		phase: string;
		title: string;
		body: string;
		points: readonly string[];
		alt: string;
	};

	const blocks = {
		workspace: {
			num: '01',
			phase: 'Pas mulai',
			title: 'Semua sumber di satu tempat',
			body: 'Cari referensi dan simpan semuanya di satu workspace — nggak ada lagi 30 tab kebuka dan bingung mana yang penting.',
			points: ['Cari jurnal dari workspace', 'PDF, DOI, dan catatan jadi satu'],
			alt: 'Workspace riset Aqsha dengan sumber, PDF, dan catatan terkumpul'
		},
		astra: {
			num: '02',
			phase: 'Pas nyusun & nulis',
			title: 'Nulis bareng Astra',
			body: 'Astra bantu nyari dan nyusun bahan dari jurnal. Kamu yang ngarahin dan mikir, dia yang bantu beresin — bukan ngerjain semuanya.',
			points: ['Arah riset tetap di tanganmu', 'Tiap poin nunjuk sumbernya'],
			alt: 'Menulis draf riset bersama asisten Astra'
		},
		citations: {
			num: '03',
			phase: 'Sebelum submit',
			title: 'Tiap sumber dicek ke aslinya',
			body: 'Sebelum dikirim, Aqsha mastiin tiap kutipan beneran ada di sumbernya — dicocokin ke isi paper aslinya, bukan cuma judulnya.',
			points: ['Yang aman ditandai', 'Yang meragukan diflag biar kamu cek dulu'],
			alt: 'Pengecekan kutipan ke paper asli sebelum submit'
		},
		provenance: {
			num: '04',
			phase: 'Kalau ditanya',
			title: 'Jejak prosesmu tersimpan',
			body: 'Setiap langkah nulismu direkam. Kalau tulisan jujurmu salah dicap buatan AI, kamu punya bukti prosesnya.',
			points: ['Kapan nulis, kapan pakai AI, kapan sitasi', 'Bukti proses, bukan cuma hasil akhir'],
			alt: 'Jejak proses penulisan yang terekam per langkah'
		}
	} satisfies Record<string, BlockCopy>;

	const revealOnce = reveal();
</script>

{#snippet blockNumber(num: string, extraClass?: string)}
	<span
		aria-hidden="true"
		class={cn(
			'font-heading block text-7xl leading-none text-foreground/15 lg:text-8xl',
			extraClass
		)}
	>
		{num}
	</span>
{/snippet}

{#snippet blockCopy(block: BlockCopy, align: 'left' | 'center' = 'left')}
	<div class={cn(revealFade, align === 'center' && 'text-center')} {@attach revealOnce}>
		<p class="text-sm font-medium text-muted-foreground sm:text-[15px]">{block.phase}</p>
		<h3
			class="font-heading mt-3 text-3xl font-normal leading-[1.08] tracking-normal text-foreground sm:text-4xl sm:leading-[1.06] lg:text-[2.75rem]"
		>
			{block.title}
		</h3>
		<p
			class={cn(
				'mt-4 max-w-xl text-pretty text-base leading-snug text-muted-foreground sm:mt-5 sm:text-lg sm:leading-snug',
				align === 'center' && 'mx-auto'
			)}
		>
			{block.body}
		</p>
		<p class="mt-4 text-sm leading-snug text-foreground/70 sm:text-[15px]">
			{block.points.join(' · ')}
		</p>
	</div>
{/snippet}

<section id="cara-kerja" class="w-full scroll-mt-[72px] py-24 sm:py-32 lg:py-40">
	<!-- Header -->
	<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
		<div class="{revealUp} mb-20 sm:mb-28 lg:mb-36" {@attach revealOnce}>
			<p class="text-[15px] leading-snug text-muted-foreground sm:text-base">
				Gimana cara pakainya
			</p>
			<h2
				class="font-heading mt-3 max-w-[min(100%,44rem)] text-[2.5rem] font-normal leading-[1.08] tracking-normal text-foreground sm:mt-4 sm:text-[2.75rem] sm:leading-[1.06] lg:text-[3.25rem] lg:leading-[1.05]"
			>
				Dari nyari jurnal sampai siap dikirim.
			</h2>
			<p
				class="mt-5 max-w-xl text-pretty text-base leading-snug text-foreground/85 sm:text-lg sm:leading-snug"
			>
				Ngikutin cara kamu riset beneran — dari kumpulin bahan sampai bukti proses.
			</p>
		</div>
	</div>

	<div id="fitur" class="scroll-mt-[72px] space-y-28 sm:space-y-40 lg:space-y-52">
		<!-- 01 — copy kiri, frame contained -->
		<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
			<div class="flex items-start gap-6 sm:gap-10">
				{@render blockNumber(blocks.workspace.num, 'mt-1 shrink-0')}
				<div class="max-w-2xl">{@render blockCopy(blocks.workspace)}</div>
			</div>
			<FeatureFrame
				class="mt-10 sm:mt-12 lg:mt-14"
				image={FRAME_IMAGES.workspace}
				alt={blocks.workspace.alt}
				aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
				sizes="(min-width: 1152px) 1152px, 100vw"
				initialRotate={-1.2}
			/>
		</div>

		<!-- 02 — copy digeser kanan, frame menjorok kanan -->
		<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
			<div class="grid gap-6 lg:grid-cols-12 lg:gap-10">
				<div class="lg:col-span-5">{@render blockNumber(blocks.astra.num)}</div>
				<div class="max-w-2xl lg:col-span-7">{@render blockCopy(blocks.astra)}</div>
			</div>
			<FeatureFrame
				class="mt-10 sm:mt-12 lg:-mr-10 lg:mt-14 lg:w-[calc(100%+2.5rem)]"
				image={FRAME_IMAGES.astra}
				alt={blocks.astra.alt}
				aspectClassName="aspect-[4/3] sm:aspect-[16/10]"
				sizes="(min-width: 1152px) 1192px, 100vw"
				initialRotate={1.2}
			/>
		</div>

		<!-- 03 — flagship: copy centered, frame full-bleed -->
		<div class="w-full">
			<div class="mx-auto w-full max-w-2xl px-4 sm:px-6">
				{@render blockNumber(blocks.citations.num, 'mx-auto w-fit')}
				<div class="mt-6">{@render blockCopy(blocks.citations, 'center')}</div>
			</div>
			<FeatureFrame
				class="mt-10 rounded-none border-x-0 sm:mt-12 lg:mt-16"
				image={FRAME_IMAGES.citations}
				alt={blocks.citations.alt}
				aspectClassName="aspect-[4/3] sm:aspect-[16/9] lg:aspect-[21/9]"
				sizes="100vw"
				initialRotate={0}
			/>
		</div>

		<!-- 04 — split: copy kiri sticky ringan, frame portrait kanan -->
		<div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
			<div class="grid gap-10 lg:grid-cols-2 lg:gap-x-16">
				<div class="lg:sticky lg:top-28 lg:self-start">
					{@render blockNumber(blocks.provenance.num)}
					<div class="mt-6">{@render blockCopy(blocks.provenance)}</div>
				</div>
				<FeatureFrame
					image={FRAME_IMAGES.provenance}
					alt={blocks.provenance.alt}
					aspectClassName="aspect-[4/3] sm:aspect-[4/5]"
					sizes="(min-width: 1024px) 45vw, 100vw"
					initialRotate={-1}
				/>
			</div>
		</div>
	</div>
</section>
