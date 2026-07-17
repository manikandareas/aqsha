<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { WORKSPACE_STAGE_LABELS } from '../labels';
	import { WORKSPACE_STAGES, type WorkspaceStage } from '../types';

	/**
	 * Stepper tahap manual. Grammar design system: tahap aktif = pilihan eksklusif → primary,
	 * bukan mint. Klik langsung menyimpan (PATCH stage) — tanpa konfirmasi, bisa diubah kapan pun.
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
</script>

<div
	role="radiogroup"
	aria-label="Tahap proyek"
	class="flex w-fit max-w-full flex-wrap items-center gap-1 rounded-md border-2 border-border bg-card p-[5px]"
>
	{#each WORKSPACE_STAGES as s (s)}
		{@const active = s === stage}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			{disabled}
			onclick={() => !active && onStageChange(s)}
			class={cn(
				'rounded-sm px-2.5 py-1 text-label font-medium transition-colors',
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
