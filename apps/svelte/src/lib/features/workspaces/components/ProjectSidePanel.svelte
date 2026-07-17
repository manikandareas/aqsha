<script lang="ts">
	import type { WorkspaceSection } from '../types';

	let {
		workspaceId,
		workspaceName,
		sections,
		activeTab,
		onTabChange,
		onClose
	}: {
		workspaceId: string;
		workspaceName: string;
		sections: WorkspaceSection[];
		activeTab: 'chat' | 'sources';
		onTabChange: (tab: 'chat' | 'sources') => void;
		onClose: () => void;
	} = $props();
</script>

<div class="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
	<p>Panel proyek…</p>
</div>
