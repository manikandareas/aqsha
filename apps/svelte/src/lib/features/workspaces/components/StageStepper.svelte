<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { WORKSPACE_STAGE_LABELS } from '../labels';
	import { WORKSPACE_STAGES, type WorkspaceStage } from '../types';

	/**
	 * Stepper tahap manual. Grammar design system: tahap aktif = pilihan eksklusif → primary,
	 * bukan mint. Klik langsung menyimpan (PATCH stage) — tanpa konfirmasi, bisa diubah kapan pun.
	 *
	 * Pola ARIA radiogroup: roving tabindex (hanya tahap aktif yang bisa di-Tab), panah kiri/atas &
	 * kanan/bawah + Home/End memindah fokus DAN memilih (selection follows focus, sama seperti klik).
	 */
	let {
		stage,
		disabled = false,
		onStageChange
	}: {
		stage: WorkspaceStage;
		disabled?: boolean;
		onStageChange: (stage: WorkspaceStage) => void;
	} = $props();

	function handleRadiogroupKeyDown(event: KeyboardEvent) {
		if (disabled) return;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
			return;
		}

		const container = event.currentTarget as HTMLElement;
		const radioEls = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]'));
		if (radioEls.length === 0) return;

		const focusedIndex = radioEls.indexOf(document.activeElement as HTMLElement);
		const current = focusedIndex === -1 ? WORKSPACE_STAGES.indexOf(stage) : focusedIndex;
		const next =
			event.key === 'ArrowRight' || event.key === 'ArrowDown'
				? (current + 1) % radioEls.length
				: event.key === 'ArrowLeft' || event.key === 'ArrowUp'
					? (current - 1 + radioEls.length) % radioEls.length
					: event.key === 'Home'
						? 0
						: radioEls.length - 1;

		event.preventDefault();
		radioEls[next]?.focus();

		const nextStage = WORKSPACE_STAGES[next];
		if (nextStage !== undefined && nextStage !== stage) onStageChange(nextStage);
	}
</script>

<!-- svelte-ignore a11y_interactive_supports_focus -->
<div
	role="radiogroup"
	aria-label="Tahap proyek"
	onkeydown={handleRadiogroupKeyDown}
	class="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md border-2 border-border bg-card p-[5px]"
>
	{#each WORKSPACE_STAGES as s (s)}
		{@const active = s === stage}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			tabindex={active ? 0 : -1}
			{disabled}
			onclick={() => !active && onStageChange(s)}
			class={cn(
				'rounded-sm px-2.5 py-1 text-label font-medium transition-colors',
				'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
				active
					? 'bg-primary text-primary-foreground'
					: 'text-muted-foreground hover:bg-muted hover:text-foreground',
				disabled && 'opacity-50'
			)}
		>
			{WORKSPACE_STAGE_LABELS[s]}
		</button>
	{/each}
</div>
