<script lang="ts">
	import SidePanelFrame from '$lib/components/layout/SidePanelFrame.svelte';
	import PanelTabsHeader from '$lib/components/layout/PanelTabsHeader.svelte';
	import PanelExpandButton from '$lib/components/layout/PanelExpandButton.svelte';
	import type { PanelTab } from '$lib/components/layout/PanelTabsHeader.svelte';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { Icon, XIcon } from '$lib/icons';
	import ProjectChatPane from './ProjectChatPane.svelte';
	import ProjectSourcesPanel from './ProjectSourcesPanel.svelte';
	import type { WorkspaceSection } from '../types';

	/** Panel kanan rumah proyek: chat ber-scope proyek + koleksi sumber + thread terbaru. */
	const TABS: PanelTab[] = [
		{ key: 'chat', label: 'Chat' },
		{ key: 'sources', label: 'Sumber' }
	];

	let {
		workspaceId,
		workspaceName,
		sections,
		activeTab,
		onTabChange,
		onClose,
		getExtraClientContext,
		onTurnSent,
		onAgentSettled
	}: {
		workspaceId: string;
		workspaceName: string;
		sections: WorkspaceSection[];
		activeTab: 'chat' | 'sources';
		onTabChange: (tab: 'chat' | 'sources') => void;
		onClose: () => void;
		getExtraClientContext?: () => string[];
		onTurnSent?: (threadId: string) => void;
		onAgentSettled?: (threadId: string) => void;
	} = $props();
</script>

<SidePanelFrame>
	{#snippet header()}
		<PanelTabsHeader
			tabs={TABS}
			activeKey={activeTab}
			onSelect={(key) => onTabChange(key as 'chat' | 'sources')}
		>
			{#snippet actions()}
				<PanelExpandButton />
				<Button
					type="button"
					variant="ghost"
					size="icon"
					class="size-7 shrink-0 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label={`Tutup panel ${workspaceName}`}
					onclick={onClose}
				>
					<Icon icon={XIcon} class="size-4" />
				</Button>
			{/snippet}
		</PanelTabsHeader>
	{/snippet}

	<div
		class={activeTab === 'chat'
			? 'flex min-h-0 flex-1 flex-col overflow-hidden'
			: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
	>
		<ProjectChatPane {workspaceId} {getExtraClientContext} {onTurnSent} {onAgentSettled} />
	</div>
	<div
		class={activeTab === 'sources'
			? 'flex min-h-0 flex-1 flex-col overflow-hidden'
			: 'hidden min-h-0 flex-1 flex-col overflow-hidden'}
	>
		<ProjectSourcesPanel {workspaceId} {sections} />
	</div>
</SidePanelFrame>
