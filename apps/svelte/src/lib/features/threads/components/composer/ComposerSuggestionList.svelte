<script lang="ts">
	import { cn } from '@aqsha/ui-svelte/utils';
	import { CompassIcon, FileTextIcon, FlaskConicalIcon, Icon, SearchIcon } from '$lib/icons';
	import { composerSuggestions } from './composer-suggestions';

	let {
		onSelectSuggestion,
		landing = false
	}: {
		onSelectSuggestion: (prompt: string) => void;
		landing?: boolean;
	} = $props();

	const suggestionIcons = [SearchIcon, CompassIcon, FlaskConicalIcon, FileTextIcon] as const;
</script>

<div class={cn('grid', landing ? 'gap-0' : 'gap-1.5')}>
	{#each composerSuggestions as item, index (item.label)}
		<button
			type="button"
			onclick={() => onSelectSuggestion(item.prompt)}
			aria-label={`Gunakan suggestion: ${item.label}`}
			class={cn(
				'group flex min-h-8 items-center gap-2 rounded-lg px-2.5 text-left font-medium text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-card hover:text-foreground active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
				landing ? 'min-h-9 px-1.5 text-control' : 'text-label'
			)}
		>
			<span
				class={cn(
					'grid size-5 shrink-0 place-items-center rounded-md bg-muted/55 transition-colors group-hover:bg-muted',
					landing && 'bg-transparent group-hover:bg-muted'
				)}
				aria-hidden="true"
			>
				<Icon icon={suggestionIcons[index]!} class="size-3.5" />
			</span>
			<span class="min-w-0 truncate">{item.label}</span>
		</button>
	{/each}
</div>
