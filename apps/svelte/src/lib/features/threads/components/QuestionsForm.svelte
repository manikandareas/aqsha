<script lang="ts" module>
	import type { AskQuestion, AskQuestionAnswer } from '@aqsha/chat-core';

	/** Per-question answer draft (UI-only; mapped to `AskQuestionAnswer` on submit). */
	type Draft = { selected: string[]; otherActive: boolean; other: string };
	const emptyDraft = (): Draft => ({ selected: [], otherActive: false, other: '' });

	function initDrafts(questions: AskQuestion[]): Record<string, Draft> {
		const out: Record<string, Draft> = {};
		for (const q of questions) out[q.id] = emptyDraft();
		return out;
	}

	const optionLetter = (index: number): string => String.fromCharCode(65 + index);

	/** Map drafts → `AskQuestionAnswer[]` (freeform / active "Lainnya…" with text → `other`). */
	function buildAnswers(
		questions: AskQuestion[],
		drafts: Record<string, Draft>
	): AskQuestionAnswer[] {
		return questions.map((q) => {
			const d = drafts[q.id] ?? emptyDraft();
			const otherText = d.other.trim();
			const includeOther = (q.options.length === 0 || d.otherActive) && otherText.length > 0;
			return includeOther
				? { id: q.id, selected: d.selected, other: otherText }
				: { id: q.id, selected: d.selected };
		});
	}
</script>

<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import type { AskQuestionsResumeData } from '@aqsha/chat-core';
	import { Icon, CheckIcon } from '$lib/icons';
	import { Button } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { cn } from '$lib/utils';

	/**
	 * Interactive clarification form (`ask_questions`) — single-choice (radio-ish keycaps) + "Lainnya…"
	 * freeform, multi-choice (checkbox), or free text. Shared by the inline card + the right panel.
	 * Answers → `AskQuestionsResumeData` sent back via `resolveAsk`.
	 */
	let {
		questions,
		findings,
		onSubmit,
		onSkip,
		scrollable = false
	}: {
		questions: AskQuestion[];
		findings?: string;
		onSubmit: (resume: AskQuestionsResumeData) => void;
		onSkip: () => void;
		scrollable?: boolean;
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);

	let drafts = $state<Record<string, Draft>>(untrack(() => initDrafts(questions)));

	function change(id: string, next: Draft): void {
		drafts = { ...drafts, [id]: next };
	}

	function handleSubmit(): void {
		onSubmit({ action: 'answered', answers: buildAnswers(questions, drafts) });
	}
</script>

{#snippet optionChip(
	letter: string,
	label: string,
	description: string | undefined,
	selected: boolean,
	multi: boolean,
	onClick: () => void
)}
	<button
		type="button"
		onclick={onClick}
		role={multi ? 'checkbox' : undefined}
		aria-checked={multi ? selected : undefined}
		aria-pressed={multi ? undefined : selected}
		class={cn(
			'flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
			selected
				? 'border-foreground/30 bg-foreground/[0.05] text-foreground'
				: 'border-border bg-card text-foreground hover:bg-muted/40'
		)}
	>
		{#if multi}
			<span
				class={cn(
					'mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
					selected
						? 'border-foreground bg-foreground text-background'
						: 'border-border/70 bg-background text-transparent'
				)}
			>
				<Icon icon={CheckIcon} class="size-3" />
			</span>
		{:else}
			<span
				class={cn(
					'mt-px inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border px-1 font-mono text-[10px] leading-none font-semibold',
					selected
						? 'border-foreground/30 bg-foreground/[0.08] text-foreground'
						: 'border-border/70 bg-background text-muted-foreground'
				)}
			>
				{letter}
			</span>
		{/if}
		<span class="min-w-0">
			<span class="block text-[13px] leading-5">{label}</span>
			{#if description}
				<span class="block text-[11px] leading-4 text-muted-foreground">{description}</span>
			{/if}
		</span>
	</button>
{/snippet}

{#snippet questionBlock(question: AskQuestion, index: number)}
	{@const draft = drafts[question.id] ?? emptyDraft()}
	{@const isFreeform = question.options.length === 0}
	{@const isMulti = question.kind === 'multi'}
	<div class="grid gap-2">
		<div class="flex gap-2 text-[13px] leading-5 font-medium text-foreground">
			<span class="tabular-nums text-muted-foreground">{index + 1}.</span>
			<span class="min-w-0">{question.prompt}</span>
		</div>

		{#if isFreeform}
			<textarea
				value={draft.other}
				oninput={(e) =>
					change(question.id, { ...draft, other: e.currentTarget.value, otherActive: true })}
				rows={2}
				placeholder="Tulis jawaban…"
				class="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
			></textarea>
		{:else}
			<div class="grid gap-1.5">
				<div class="flex flex-wrap gap-1.5">
					{#each question.options as opt, i (opt.label)}
						{@render optionChip(
							optionLetter(i),
							opt.label,
							opt.description,
							draft.selected.includes(opt.label),
							isMulti,
							() =>
								isMulti
									? change(question.id, {
											...draft,
											selected: draft.selected.includes(opt.label)
												? draft.selected.filter((l) => l !== opt.label)
												: [...draft.selected, opt.label]
										})
									: change(question.id, { ...draft, selected: [opt.label], otherActive: false })
						)}
					{/each}
					{#if question.allowOther}
						{@render optionChip(
							optionLetter(question.options.length),
							'Lainnya…',
							undefined,
							draft.otherActive,
							isMulti,
							() =>
								change(
									question.id,
									isMulti
										? { ...draft, otherActive: !draft.otherActive }
										: { ...draft, selected: [], otherActive: true }
								)
						)}
					{/if}
				</div>
				{#if question.allowOther && draft.otherActive}
					<input
						value={draft.other}
						oninput={(e) =>
							change(question.id, { ...draft, other: e.currentTarget.value, otherActive: true })}
						placeholder="Tulis jawaban lain…"
						class="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring"
						transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
					/>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

{#snippet fields()}
	<div class={cn('grid gap-4', scrollable && 'pr-3')}>
		{#if findings}
			<p
				class="rounded-lg bg-muted/40 px-2.5 py-2 text-[13px] leading-5 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]"
			>
				{findings}
			</p>
		{/if}
		{#each questions as q, i (q.id)}
			{@render questionBlock(q, i)}
		{/each}
	</div>
{/snippet}

<div class="grid gap-3">
	{#if scrollable}
		<ScrollArea class="max-h-60">{@render fields()}</ScrollArea>
	{:else}
		{@render fields()}
	{/if}
	<div class="flex gap-2">
		<Button type="button" size="sm" onclick={handleSubmit}>Kirim</Button>
		<Button type="button" size="sm" variant="ghost" onclick={onSkip}>Lewati</Button>
	</div>
</div>
