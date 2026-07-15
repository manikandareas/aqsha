<script lang="ts">
	import ThreadDetailShell from '$lib/features/thread-experience/components/ThreadDetailShell.svelte';

	// `/app` landing — a NEW thread (no id): the rich composer hero + recent/suggestion start panel.
	// `ThreadDetailShell` bumps the URL to /app/threads/<id> on the first send (shallow, no remount).
	// The thread list lives in the sidebar (AppShell).
</script>

<ThreadDetailShell />
