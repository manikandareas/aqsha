<script lang="ts">
	import { Icon, MessageSquareIcon, ArrowUpRightIcon } from '$lib/icons';
	import { takeRecentThreads } from '$lib/features/threads/lib/recent-thread-summaries';
	import type { RecentThreadSummary } from '$lib/features/threads/types';

	let {
		recentThreads,
		onSelectThread,
		onSelectSuggestion
	}: {
		recentThreads: RecentThreadSummary[];
		onSelectThread: (threadId: string) => void;
		onSelectSuggestion: (prompt: string) => void;
	} = $props();

	const composerSuggestions = [
		{
			emoji: '🔎',
			label: 'Cari sumber akademik',
			prompt: 'Cari sumber akademik terbaru tentang dampak AI pada pembelajaran mandiri.'
		},
		{
			emoji: '🧭',
			label: 'Buat peta riset',
			prompt: 'Buat peta riset awal untuk topik literasi digital siswa SMA.'
		},
		{
			emoji: '🧪',
			label: 'Susun metodologi',
			prompt: 'Susun rancangan metodologi penelitian kualitatif untuk evaluasi chatbot belajar.'
		},
		{
			emoji: '📝',
			label: 'Buat outline tulisan',
			prompt: 'Buat outline artikel ilmiah tentang penggunaan AI sebagai tutor personal.'
		}
	] as const;

	const sortedThreads = $derived(takeRecentThreads(recentThreads));

	const THREAD_EMPTY_ROW_WIDTHS = ['74%', '56%', '82%', '44%'];
</script>

<div class="grid gap-4 @2xl:grid-cols-[1.05fr_0.95fr]">
	<section class="grid min-w-0 gap-2">
		<h2 class="px-1 text-left text-label font-semibold tracking-normal text-muted-foreground">
			Thread terbaru
		</h2>
		<div class="grid gap-1.5">
			{#if sortedThreads.length > 0}
				{#each sortedThreads as thread (thread.threadId)}
					<button
						type="button"
						onclick={() => onSelectThread(thread.threadId)}
						class="group grid min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg px-2.5 text-left transition-colors duration-150 hover:bg-card motion-safe:animate-in motion-safe:fade-in-0"
					>
						<Icon
							icon={MessageSquareIcon}
							class="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
						/>
						<span
							class="min-w-0 truncate text-label font-medium text-muted-foreground transition-colors group-hover:text-foreground"
						>
							{thread.title}
						</span>
						<Icon
							icon={ArrowUpRightIcon}
							class="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
						/>
					</button>
				{/each}
			{:else}
				<div
					class="relative isolate min-h-[8.75rem] overflow-hidden rounded-xl border-2 border-dashed border-border bg-muted/15"
				>
					<div
						inert
						aria-hidden="true"
						class="pointer-events-none absolute inset-x-0 top-0 grid select-none gap-1.5 p-2"
					>
						{#each THREAD_EMPTY_ROW_WIDTHS as width (width)}
							<div
								class="grid min-h-8 grid-cols-[auto_1fr_auto] items-center gap-2 rounded-lg bg-background/45 px-2.5"
							>
								<Icon icon={MessageSquareIcon} class="size-3.5 shrink-0 text-muted-foreground/40" />
								<span
									class="block h-2 justify-self-start self-center rounded-full bg-muted-foreground/15"
									style="width: {width}"
								></span>
								<Icon icon={ArrowUpRightIcon} class="size-3.5 shrink-0 text-muted-foreground/40" />
							</div>
						{/each}
					</div>
					<div class="absolute inset-0 bg-background/70"></div>
					<div class="relative grid min-h-[inherit] place-items-center p-4 text-center">
						<div class="grid max-w-[15rem] justify-items-center gap-2">
							<span
								class="lip-static grid size-9 place-items-center rounded-xl border-2 border-border bg-background text-muted-foreground"
							>
								<Icon icon={MessageSquareIcon} class="size-4" />
							</span>
							<p class="text-control font-semibold text-foreground">Mulai percakapan sekarang</p>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</section>

	<section class="grid min-w-0 gap-2">
		<h2 class="px-1 text-left text-label font-semibold tracking-normal text-muted-foreground">
			Saran
		</h2>
		<div class="grid gap-1.5">
			{#each composerSuggestions as item (item.label)}
				<button
					type="button"
					onclick={() => onSelectSuggestion(item.prompt)}
					aria-label={`Gunakan suggestion: ${item.label}`}
					class="group flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-left text-label font-medium text-muted-foreground transition-colors duration-150 hover:bg-card hover:text-foreground"
				>
					<span
						class="grid size-5 shrink-0 place-items-center rounded-md bg-muted/55 text-label transition-colors group-hover:bg-muted"
						aria-hidden="true"
					>
						{item.emoji}
					</span>
					<span class="min-w-0 truncate">{item.label}</span>
				</button>
			{/each}
		</div>
	</section>
</div>
