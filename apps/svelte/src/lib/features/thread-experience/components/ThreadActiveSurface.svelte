<script lang="ts">
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import type { StatsGroup } from '@aqsha/chat-core/stats-viz';
	import { Icon, ClockIcon, WrenchIcon, XIcon } from '$lib/icons';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import {
		Conversation,
		ConversationContent,
		ConversationScrollButton
	} from '$lib/components/ai-elements';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { threadTranscriptColumnClass } from '$lib/components/layout/panel-surface';
	import MessageList from '$lib/features/threads/components/MessageList.svelte';
	import ToolCard from '$lib/features/threads/components/ToolCard.svelte';
	import type { MessageAttachment } from '$lib/features/threads/lib/attachment-buckets';
	import { wfStepLabel } from '$lib/features/threads/lib/mastra-timeline';
	import type { ResearchSource } from '$lib/features/threads/types';
	import type { ThreadAgent } from '$lib/features/threads/state/thread-agent.svelte';
	import type { ThreadPanelController } from './thread-panel-context.svelte';
	import { LIVE_PLAN_KEY } from '../utils/thread-panel-model';
	import AskGateStrip from './AskGateStrip.svelte';
	import DeepNoticeCard from './DeepNoticeCard.svelte';
	import PlanGateStrip from './PlanGateStrip.svelte';
	import {
		Composer,
		type ComposerNotice,
		type ComposerSendPayload
	} from '$lib/features/threads/components/composer';

	let {
		agent,
		panel,
		sourcesByTurn,
		statsGroupsByToolCallId,
		attachmentsByMessage,
		busy,
		blocked,
		notice,
		threadId,
		threadAgentKind,
		errorDraft,
		onComposerSend
	}: {
		agent: ThreadAgent;
		panel: ThreadPanelController | null;
		sourcesByTurn: Map<string, ResearchSource[]>;
		statsGroupsByToolCallId: Map<string, StatsGroup>;
		attachmentsByMessage: Map<string, MessageAttachment[]>;
		busy: boolean;
		blocked: boolean;
		notice: ComposerNotice | null;
		threadId: string;
		threadAgentKind: 'lite' | 'pro';
		errorDraft: string | null;
		onComposerSend: (payload: ComposerSendPayload) => void;
	} = $props();

	const reduce = $derived(prefersReducedMotion.current);
</script>

<div class="flex h-full min-h-0 w-full flex-col">
	<Conversation class="flex-1">
		<ConversationContent class="max-w-none p-0">
			<div class={cn(threadTranscriptColumnClass, 'flex flex-col gap-4 pt-3 pb-8')}>
				<MessageList
					messages={agent.messages}
					pending={agent.status === 'submitted'}
					{busy}
					{sourcesByTurn}
					{statsGroupsByToolCallId}
					{attachmentsByMessage}
					onRegenerate={() => void agent.regenerate()}
				/>
				{#if agent.error}
					<p class="text-sm text-destructive">{agent.error}</p>
				{/if}
			</div>
		</ConversationContent>
		{#snippet overlay()}
			<ConversationScrollButton />
		{/snippet}
	</Conversation>
	<div class={cn(threadTranscriptColumnClass, 'flex flex-col gap-2.5 pt-2.5 pb-4')}>
		{#if agent.deepStalled}
			<DeepNoticeCard
				body={agent.deepStalled}
				primary={{ label: 'Mulai ulang', onClick: () => void agent.restartDeep() }}
				secondary={{ label: 'Hentikan', onClick: () => agent.stop() }}
			/>
		{/if}
		{#if agent.deepFailed}
			<DeepNoticeCard
				body={`Riset mendalam gagal${agent.deepFailed.stepId ? ` pada langkah "${wfStepLabel(agent.deepFailed.stepId).toLowerCase()}"` : ''}. Coba lagi akan melanjutkan dari langkah itu tanpa memotong kredit baru.`}
				detail={agent.deepFailed.message}
				primary={{
					label: 'Coba lagi',
					onClick: () => void agent.retryDeep(),
					disabled: busy
				}}
				secondary={{ label: 'Buang', onClick: () => agent.dismissDeepFailure() }}
			/>
		{/if}
		{#if agent.deepNotice && !agent.messages.some((m) => m.id === `deep-bail:${agent.deepNotice!.runId}`)}
			<DeepNoticeCard
				body={`Riset mendalam dihentikan: ${agent.deepNotice.reason}`}
				primary={{
					label: 'Tutup',
					onClick: () => agent.dismissDeepNotice(),
					icon: XIcon
				}}
			/>
		{/if}
		{#if agent.askGate}
			<AskGateStrip
				askGate={agent.askGate}
				onSubmit={(resume) => void agent.resolveAsk(resume)}
				onSkip={() => void agent.resolveAsk({ action: 'skipped' })}
				onOpenPanel={panel ? () => panel.openQuestionsPanel() : undefined}
			/>
		{/if}
		{#if agent.planGate}
			<PlanGateStrip
				planGate={agent.planGate}
				onApprove={() => void agent.resolvePlan(true)}
				onDecline={() => void agent.resolvePlan(false)}
				onOpenPanel={panel ? () => panel.openPlanPanel(LIVE_PLAN_KEY) : undefined}
			/>
		{/if}
		{#if agent.approvals.length > 0}
			<div
				class={cn(threadTranscriptColumnClass, 'flex flex-col gap-2.5')}
				transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
			>
				{#each agent.approvals as a (a.toolCallId)}
					<ToolCard
						icon={WrenchIcon}
						title={a.title}
						meta={typeof a.args.artifactId === 'string' ? a.args.artifactId : undefined}
					>
						<div class="flex gap-2">
							<Button size="sm" onclick={() => void agent.approve(a.toolCallId)}>Setujui</Button>
							<Button size="sm" variant="ghost" onclick={() => void agent.decline(a.toolCallId)}>
								Tolak
							</Button>
						</div>
					</ToolCard>
				{/each}
			</div>
		{/if}
		{#if agent.queued.length > 0}
			<div
				class={cn(threadTranscriptColumnClass, 'flex flex-col gap-1.5')}
				transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
			>
				{#each agent.queued as q (q.id)}
					<div
						class="flex items-center gap-2 rounded-lg border-2 border-border bg-muted/30 px-3 py-2 text-control"
					>
						<Icon icon={ClockIcon} class="size-3.5 shrink-0 text-muted-foreground" />
						<span class="min-w-0 flex-1 truncate text-foreground">{q.text}</span>
						<span class="shrink-0 text-label text-muted-foreground">
							{q.mode === 'deep' ? 'Antre · /deep' : q.serverRunId ? 'Antre di server' : 'Antre'}
						</span>
						{#if q.serverRunId === undefined}
							<button
								type="button"
								onclick={() => agent.cancelQueued(q.id)}
								aria-label="Batalkan antrean"
								class="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
							>
								<Icon icon={XIcon} class="size-3.5" />
							</button>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
		<Composer
			onSend={onComposerSend}
			onStop={() => agent.stop()}
			{busy}
			disabled={blocked}
			{notice}
			{threadId}
			{threadAgentKind}
			{errorDraft}
			showSuggestions={false}
		/>
	</div>
</div>
