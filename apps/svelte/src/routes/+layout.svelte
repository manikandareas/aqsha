<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.ico" sizes="any" />
	<link rel="icon" type="image/png" href="/icon.png" />
	<link rel="apple-touch-icon" href="/apple-icon.png" />
</svelte:head>

{@render children()}
