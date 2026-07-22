<script lang="ts">
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { Icon, PencilIcon } from '$lib/icons';
	import AnnotationClearToolbar from './AnnotationClearToolbar.svelte';

	/**
	 * Header control for preview annotation mode: pencil toggles the mode; when on, a mint-soft
	 * shell expands to reveal clear. Motion is state-only (expand/collapse), ease-out ~200ms.
	 */
	let {
		annotationMode = $bindable(false),
		visibleIds,
		onDismiss,
		disabled = false
	}: {
		annotationMode?: boolean;
		visibleIds: readonly string[];
		onDismiss: (ids: string[]) => Promise<void>;
		disabled?: boolean;
	} = $props();
</script>

<div
	class={cn(
		'annotation-mode-controls inline-grid items-center',
		'motion-safe:transition-[grid-template-columns,background-color,border-color,padding,gap] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]',
		'motion-reduce:transition-none'
	)}
	data-expanded={annotationMode ? '' : undefined}
	role="group"
	aria-label="Kontrol anotasi"
>
	<Button
		type="button"
		size="icon-sm"
		variant={annotationMode ? 'ghost' : 'outline'}
		aria-label={annotationMode ? 'Matikan mode anotasi' : 'Nyalakan mode anotasi'}
		aria-pressed={annotationMode}
		class={cn(
			'shrink-0 rounded-full transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150 ease-out',
			'motion-safe:active:scale-[0.97]',
			annotationMode
				? 'lip-static size-7 border-2 border-mint-strong bg-mint-strong text-white hover:bg-mint-strong hover:brightness-[1.06] hover:text-white [--lip-color:color-mix(in_oklch,var(--mint-strong)_62%,black_38%)]'
				: 'border-2 bg-card'
		)}
		onclick={() => (annotationMode = !annotationMode)}
	>
		<Icon icon={PencilIcon} class="size-3.5" />
	</Button>

	<div
		class={cn(
			'annotation-mode-clear min-w-0 overflow-hidden',
			'motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.23,1,0.32,1)]',
			'motion-reduce:transition-none'
		)}
		aria-hidden={!annotationMode}
		inert={!annotationMode}
	>
		<div class="flex items-center pr-0.5">
			<AnnotationClearToolbar {visibleIds} {disabled} {onDismiss} />
		</div>
	</div>
</div>

<style>
	.annotation-mode-controls {
		grid-template-columns: auto 0fr;
		gap: 0;
		border: 2px solid transparent;
		border-radius: 9999px;
		background-color: transparent;
		padding: 0;
	}

	.annotation-mode-controls[data-expanded] {
		grid-template-columns: auto 1fr;
		gap: 2px;
		border-color: var(--mint-soft-border);
		background-color: var(--mint-soft);
		padding: 2px;
	}

	.annotation-mode-clear {
		opacity: 0;
		transform: scale(0.95);
		pointer-events: none;
	}

	.annotation-mode-controls[data-expanded] .annotation-mode-clear {
		opacity: 1;
		transform: scale(1);
		pointer-events: auto;
	}

	@media (prefers-reduced-motion: reduce) {
		.annotation-mode-clear {
			transform: none;
		}
	}
</style>
