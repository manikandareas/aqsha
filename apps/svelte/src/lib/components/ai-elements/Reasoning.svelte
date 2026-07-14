<script lang="ts">
	import { Streamdown } from 'svelte-streamdown';
	import { cn } from '$lib/utils';

	// Reasoning summary — port of `apps/web/components/ai-elements/reasoning.tsx`. Plain markdown (NO
	// citation/stats/viz custom tags — reasoning never carries them), same security config as `Response`.
	// The smooth-reveal (`useSmoothText`) is a Phase 7 UX nicety; Phase 6 renders the text directly.

	let {
		text,
		isThinking = false,
		class: klass
	}: { text: string; isThinking?: boolean; class?: string } = $props();
</script>

{#if text.trim()}
	<div
		data-streamdown
		data-thinking={isThinking}
		class={cn('aqsha-prose aqsha-prose-message', klass)}
	>
		<Streamdown
			content={text}
			baseTheme="shadcn"
			parseIncompleteMarkdown={true}
			allowedLinkPrefixes={['https://', 'http://', 'mailto:', '/']}
			allowedImagePrefixes={['https://', 'http://', '/']}
		/>
	</div>
{/if}
