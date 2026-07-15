<script lang="ts">
	import { WORKSPACE_EMOJI_CHOICES } from '$lib/features/workspaces/emoji-choices';

	/**
	 * Workspace emoji picker — port of `apps/web/features/workspaces/components/
	 * workspace-emoji-picker-content.tsx`. Web used `frimousse` (a React-only searchable emoji
	 * picker); the Svelte port renders the curated `WORKSPACE_EMOJI_CHOICES` grid instead — the API
	 * still validates any emoji via `normalizeWorkspaceEmoji`, and the picker stays dependency-free.
	 */
	let { onSelect }: { onSelect: (emoji: string) => void } = $props();
</script>

<div class="isolate flex h-[21rem] flex-col bg-popover">
	<div class="grid min-h-0 flex-1 grid-cols-8 gap-1 overflow-y-auto p-2">
		{#each WORKSPACE_EMOJI_CHOICES as emoji (emoji)}
			<button
				type="button"
				onclick={() => onSelect(emoji)}
				class="inline-flex size-8 items-center justify-center rounded-md text-[19px] leading-none transition-colors hover:bg-muted data-[active]:bg-muted"
			>
				{emoji}
			</button>
		{/each}
	</div>
</div>
