<script lang="ts">
	import { dev } from '$app/environment';
	import { Agentation } from 'sv-agentation';
	import AppToaster from '$lib/components/layout/AppToaster.svelte';
	import MotionProvider from '$lib/components/layout/MotionProvider.svelte';
	import ThemeProvider from '$lib/components/layout/ThemeProvider.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<ThemeProvider>
	<MotionProvider>
		{@render children()}
	</MotionProvider>
	<AppToaster />
</ThemeProvider>

{#if dev}
	<Agentation />
{/if}
