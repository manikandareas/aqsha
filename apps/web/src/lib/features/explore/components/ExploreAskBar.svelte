<script lang="ts">
	import { untrack } from 'svelte';
	import { Icon, SearchIcon, XIcon } from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { useExploreSuggest } from '../api';

	/**
	 * Hero ask-bar. Typing → LLM query suggestions (typeahead, /explore/suggest). Enter / click a
	 * suggestion → set the page URL `q` → every section below reacts to it. Full search results live in
	 * the feed. Debounced suggest + URL sync use guarded `$effect`s.
	 */
	let { value, onSubmit }: { value: string; onSubmit: (q: string) => void } = $props();

	let draft = $state(untrack(() => value));
	let focused = $state(false);
	let blurTimer: ReturnType<typeof setTimeout> | null = null;

	// Sync draft when `value` (URL q) changes from outside — guarded $effect (not a derived reflex).
	let lastValue = untrack(() => value);
	$effect(() => {
		if (value !== lastValue) {
			lastValue = value;
			draft = value;
		}
	});

	// Debounce the trimmed draft (250ms) for the suggest query.
	let debounced = $state(untrack(() => draft.trim()));
	$effect(() => {
		const d = draft.trim();
		const id = setTimeout(() => (debounced = d), 250);
		return () => clearTimeout(id);
	});

	const auth = getAuthState();
	const suggest = useExploreSuggest(
		() => (focused ? debounced : ''),
		() => auth.isSignedIn
	);
	const suggestions = $derived(suggest.data ?? []);
	const open = $derived(focused && draft.trim().length >= 2 && suggestions.length > 0);

	function submit(next?: string): void {
		const q = (next ?? draft).trim();
		if (!q) return;
		draft = q;
		focused = false;
		onSubmit(q);
	}
</script>

<div class="relative max-w-[600px]">
	<div
		class="flex items-center gap-3 rounded-xl border-2 border-border bg-background px-4 py-3.5 transition-colors focus-within:border-ring/55"
	>
		<Icon icon={SearchIcon} class="size-[18px] shrink-0 text-muted-foreground" />
		<input
			bind:value={draft}
			onfocus={() => {
				if (blurTimer) clearTimeout(blurTimer);
				focused = true;
			}}
			onblur={() => {
				blurTimer = setTimeout(() => (focused = false), 120);
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter') submit();
				if (e.key === 'Escape') focused = false;
			}}
			type="text"
			placeholder="Tanya atau cari topik…"
			class="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
		/>
		{#if value}
			<button
				type="button"
				onclick={() => {
					draft = '';
					onSubmit('');
				}}
				aria-label="Hapus pencarian"
				class="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
			>
				<Icon icon={XIcon} class="size-3.5" />
			</button>
		{/if}
		<button
			type="button"
			onclick={() => submit()}
			aria-label="Cari"
			class="shrink-0 rounded-md border border-border bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-primary"
		>
			↵
		</button>
	</div>

	{#if open}
		<div
			class="animate-in fade-in-0 zoom-in-95 absolute z-20 mt-2 w-full origin-top rounded-2xl border-2 border-border bg-card p-1.5 shadow-md duration-150 ease-out"
		>
			<p class="px-2 py-1 font-mono text-[10px] tracking-wide text-muted-foreground">
				Saran pencarian
			</p>
			{#each suggestions as s (s)}
				<button
					type="button"
					onmousedown={(e) => e.preventDefault()}
					onclick={() => submit(s)}
					class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-secondary"
				>
					<Icon icon={SearchIcon} class="size-3.5 shrink-0 text-muted-foreground" />
					<span class="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{s}</span>
				</button>
			{/each}
		</div>
	{/if}
</div>
