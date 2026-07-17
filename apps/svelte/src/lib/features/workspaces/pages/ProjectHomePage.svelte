<script lang="ts">
	import { useClerkContext } from 'svelte-clerk';
	import { PageTitle } from '$lib/seo';
	import DetailSplitLayout from '$lib/components/layout/DetailSplitLayout.svelte';
	import { Spinner } from '$lib/components/ui/spinner';
	import {
		ComposerMentions,
		setComposerMentions
	} from '$lib/features/threads/state/composer-mentions.svelte';
	import ProjectSidePanel from '../components/ProjectSidePanel.svelte';
	import ProjectHeader from '../components/ProjectHeader.svelte';
	import SectionOutline from '../components/SectionOutline.svelte';
	import { useSections, useWorkspace } from '../api';
	import { projectDisplayTitle, type WorkspaceSection } from '../types';

	/**
	 * Rumah proyek: kiri kerangka bab (bintang), kanan sumber proyek + thread terbaru,
	 * atas identitas. Chat hidup di panel kanan — selalu ber-scope proyek ini.
	 */
	let { workspaceId }: { workspaceId: string } = $props();

	const clerk = useClerkContext();
	const enabled = $derived(clerk.isLoaded && Boolean(clerk.auth.userId));

	// Channel mention per-halaman: chip ambient proyek + draft "Tulis dengan Astra"
	// dibaca composer panel chat (pohon yang sama).
	const mentions = new ComposerMentions();
	setComposerMentions(mentions);

	const workspace = useWorkspace(
		() => workspaceId,
		() => enabled
	);
	const sections = useSections(
		() => workspaceId,
		() => enabled
	);
	const isFreeform = $derived(workspace.data?.kind === 'freeform');

	$effect(() => {
		const w = workspace.data;
		if (!w) return;
		mentions.setAmbientContextRefs([
			{ kind: 'workspace', workspaceId: w.id, label: projectDisplayTitle(w) }
		]);
	});

	let sideOpen = $state(true);
	let panelTab = $state<'chat' | 'sources'>('chat');

	function writeWithAstra(section: WorkspaceSection) {
		mentions.setComposerDraft(
			`Bantu saya menulis bab "${section.title}". Mulai dari kerangka dan poin utama berdasarkan sumber yang sudah ada di proyek ini.`
		);
		panelTab = 'chat';
		sideOpen = true;
	}
</script>

{#if workspace.data}
	<PageTitle title={projectDisplayTitle(workspace.data)} />
{/if}

{#if workspace.isPending || sections.isPending}
	<div class="flex h-svh flex-1 items-center justify-center gap-2 text-muted-foreground">
		<Spinner class="size-4" />
		<span class="text-sm">Memuat proyek…</span>
	</div>
{:else if !workspace.data}
	<div class="flex h-svh flex-1 items-center justify-center text-muted-foreground">
		<p>Proyek tidak ditemukan.</p>
	</div>
{:else}
	<div class="flex h-svh min-h-0 min-w-0 flex-col overflow-hidden bg-background">
		<DetailSplitLayout {sideOpen} onSideOpenChange={(open) => (sideOpen = open)}>
			{#snippet main()}
				<ProjectHeader workspace={workspace.data!} />
				<div class="min-h-0 flex-1 overflow-y-auto">
					{#if isFreeform}
						<div class="flex flex-col items-start gap-2 px-6 py-8 text-muted-foreground">
							<p class="font-medium text-foreground">Proyek bebas — tanpa kerangka bab.</p>
							<p class="text-sm">
								Mulai dari chat di panel kanan, atau kumpulkan sumber untuk proyek ini.
							</p>
						</div>
					{:else}
						<SectionOutline
							{workspaceId}
							sections={sections.data ?? []}
							onWriteWithAstra={writeWithAstra}
						/>
					{/if}
				</div>
			{/snippet}
			{#snippet side()}
				<ProjectSidePanel
					{workspaceId}
					workspaceName={projectDisplayTitle(workspace.data!)}
					sections={sections.data ?? []}
					activeTab={panelTab}
					onTabChange={(tab) => (panelTab = tab)}
					onClose={() => (sideOpen = false)}
				/>
			{/snippet}
		</DetailSplitLayout>
	</div>
{/if}
