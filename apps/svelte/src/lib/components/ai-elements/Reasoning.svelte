<script lang="ts">
	import { Streamdown } from 'svelte-streamdown';
	import { cn } from '$lib/utils';
	import { useSmoothText } from '$lib/features/threads/lib/smooth-text.svelte';

	// Reasoning summary — port of `apps/web/components/ai-elements/reasoning.tsx`. Plain markdown (NO
	// citation/stats/viz custom tags — reasoning never carries them), same security config as `Response`.
	// Smooth-revealed while thinking (`useSmoothText`, enabled = isThinking).

	let {
		text,
		isThinking = false,
		class: klass
	}: { text: string; isThinking?: boolean; class?: string } = $props();

	const smooth = useSmoothText(
		() => text,
		() => isThinking
	);
</script>

{#if text.trim()}
	<div
		data-streamdown
		data-thinking={isThinking}
		class={cn('aqsha-prose aqsha-prose-message', klass)}
	>
		<Streamdown
			content={smooth.current}
			baseTheme="shadcn"
			parseIncompleteMarkdown={true}
			allowedLinkPrefixes={['https://', 'http://', 'mailto:', '/']}
			allowedImagePrefixes={['https://', 'http://', '/']}
		/>
	</div>
{/if}
