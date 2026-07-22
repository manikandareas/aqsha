<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import {
		buildDocumentAnnotationClientContext,
		type ContextRef,
		contextRefKey,
		DEEP_COMMAND_ID,
		getPromptCommand,
		matchPromptCommandInContent,
		MENTION_MARKER_OPEN,
		type PromptCommand,
		resolveCommandDispatch,
		splitContextRefs,
		stripPromptCommandSlug
	} from '@aqsha/chat-core';
	import {
		Icon,
		AlertCircleIcon,
		ArrowUpIcon,
		Loader2Icon,
		PaperclipIcon,
		SquareIcon
	} from '$lib/icons';
	import { getAuthState } from '$lib/auth';
	import { Button } from '@aqsha/ui-svelte/components/button';
	import { cn } from '@aqsha/ui-svelte/utils';
	import { useBillingCurrent } from '$lib/features/settings/api';
	import { isCreditsLow } from '$lib/features/settings/lib/billing-derived';
	import { useWorkspacesList } from '$lib/features/workspaces/api';
	import { useContextPickerArtifacts } from '$lib/features/artifacts/api';
	import {
		useHydrateContext,
		useRemoveThreadAttachment,
		useThreadArtifacts,
		useThreadAttachments
	} from '../../api';
	import { getComposerMentions } from '../../state/composer-mentions.svelte';
	import { useComposerAgentSelection } from './agent-selection.svelte';
	import AgentSelector from './AgentSelector.svelte';
	import ComposerStartPanel from './ComposerStartPanel.svelte';
	import ComposerSuggestionList from './ComposerSuggestionList.svelte';
	import FileChip from './FileChip.svelte';
	import TokenizedPromptInput from './TokenizedPromptInput.svelte';
	import type { ComposerAttachment, ComposerNotice, ComposerSendPayload } from './composer-types';
	import { useComposerContextRefEpochMerges } from './composer-context-refs.svelte';
	import type { RecentThreadSummary } from '../../types';
	import type {
		ComposerPlaceholder,
		ContextItemOption,
		ContextWorkspaceOption
	} from './palette-types';

	const MAX_LENGTH = 8000;

	let {
		onSend,
		onStop,
		busy = false,
		disabled = false,
		notice = null,
		threadId = null,
		threadAgentKind = 'lite',
		ambientWorkspaceId = null,
		errorDraft = null,
		showSuggestions = false,
		showLandingSuggestions = false,
		recentThreads = [],
		initialContent,
		placeholder
	}: {
		onSend: (payload: ComposerSendPayload) => void;
		onStop?: () => void;
		busy?: boolean;
		disabled?: boolean;
		notice?: ComposerNotice | null;
		threadId?: string | null;
		threadAgentKind?: 'lite' | 'pro';
		ambientWorkspaceId?: string | null;
		errorDraft?: string | null;
		/** Landing hero: roomier collapsed row + start-panel suggestions below. */
		showSuggestions?: boolean;
		/** Initial project-chat rail: four prompts above the unchanged composer shell. */
		showLandingSuggestions?: boolean;
		recentThreads?: RecentThreadSummary[];
		initialContent?: string;
		placeholder?: ComposerPlaceholder;
	} = $props();

	const resolvedPlaceholder: ComposerPlaceholder = $derived(
		placeholder ?? { narrow: 'Tulis pesan…', wide: 'Tulis pesan untuk Astra…' }
	);

	const mentions = getComposerMentions();
	const auth = getAuthState();
	const authReady = () => auth.isSignedIn;

	let content = $state(untrack(() => initialContent ?? ''));
	let richContent = $state(untrack(() => initialContent ?? ''));
	let commands = $state<PromptCommand[]>([]);
	let contextRefs = $state<ContextRef[]>([]);
	let attachments = $state<ComposerAttachment[]>([]);
	// @mention workspace picker: workspace list feeds the top-level palette; drilling fetches artifacts
	// on demand (query dormant until `drillWorkspaceId` is set by the tokenized editor).
	let drillWorkspaceId = $state<string | null>(null);
	const workspacesQuery = useWorkspacesList(() => false, authReady);
	const contextItemsQuery = useContextPickerArtifacts(() => drillWorkspaceId, authReady);
	const contextWorkspaces: ContextWorkspaceOption[] = $derived(
		(workspacesQuery.data?.pages ?? []).flatMap((page) =>
			page.items.map((w) => ({ workspaceId: w.id, name: w.name, emoji: w.emoji ?? undefined }))
		)
	);
	const workspaceItems: ContextItemOption[] = $derived.by(() => {
		const wsId = drillWorkspaceId;
		if (!wsId) return [];
		return (contextItemsQuery.data?.items ?? []).map((a) => ({
			workspaceId: wsId,
			artifactId: a._id,
			title: a.title
		}));
	});
	let editorHeight = $state(24);
	let isSending = $state(false);
	let uploadError = $state<string | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let composerShellEl = $state<HTMLDivElement | null>(null);

	const agentSelection = useComposerAgentSelection(() => threadAgentKind);
	const hydrate = useHydrateContext();
	const attachmentUpload = useThreadAttachments(() => threadId ?? '');
	const removeAttachment = useRemoveThreadAttachment(() => threadId ?? '');
	const billing = useBillingCurrent(authReady);

	// D5: large attachments index async (initial `pending`). Poll the thread artifact list ONLY while a
	// pending upload exists; the live chip status is derived from the poll (not duplicated in local state) +
	// a one-time toast per artifact if indexing fails.
	const hasPendingUpload = $derived(attachments.some((a) => a.indexingStatus === 'pending'));
	const threadArtifacts = useThreadArtifacts(
		() => (hasPendingUpload ? (threadId ?? null) : null),
		authReady,
		{ pollWhilePending: true }
	);
	const attachmentsView = $derived(
		attachments.map((a) => {
			const live = threadArtifacts.data?.find((it) => it._id === a.artifactId)?.indexingStatus;
			return live ? { ...a, indexingStatus: live } : a;
		})
	);
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- non-reactive dedupe registry (toast once)
	const toastedFailures = new Set<string>();
	$effect(() => {
		for (const a of attachmentsView) {
			if (a.indexingStatus === 'failed' && !toastedFailures.has(a.artifactId)) {
				toastedFailures.add(a.artifactId);
				toast.warning(`"${a.title}" gagal diindeks; Astra mungkin tak bisa membaca isinya.`);
			}
		}
	});

	useComposerContextRefEpochMerges(
		mentions,
		() => contextRefs,
		(refs) => {
			contextRefs = refs;
		}
	);

	// Re-seed pre-seeded text (e.g. an Explore item) only while the user hasn't diverged (guarded effect
	// = external-source sync; `untrack` avoids depending on `content`).
	let lastSeed = untrack(() => initialContent ?? '');
	$effect(() => {
		const nextSeed = initialContent ?? '';
		if (nextSeed === lastSeed) return;
		const current = untrack(() => content);
		if (current === lastSeed) content = nextSeed;
		lastSeed = nextSeed;
	});

	// Two-way sync: a selection pill removed by the user in the editor → drop it from the selection
	// channel (deselects the library card / annotation highlight). Only fires from editor events (not
	// programmatic injection), so a selection ref gone from `next` was genuinely removed by the user.
	function handleContextRefsChange(next: ContextRef[]): void {
		if (mentions.selectionRefs.length > 0) {
			const nextKeys = new Set(next.map(contextRefKey));
			for (const ref of mentions.selectionRefs) {
				const key = contextRefKey(ref);
				if (!nextKeys.has(key)) mentions.removeSelectionRefByKey(key);
			}
		}
		contextRefs = next;
	}

	// Retry (Slice 6.8): a failed turn → restore the last draft into the editor (resend = new turn).
	let seenDraft = $state<string | null>(null);
	$effect(() => {
		if (errorDraft) {
			if (errorDraft !== untrack(() => seenDraft)) {
				seenDraft = errorDraft;
				content = errorDraft;
			}
		} else if (untrack(() => seenDraft) !== null) {
			seenDraft = null;
		}
	});

	// Prefill composer text (stats next-step chip, "Tulis dengan Astra" CTA) — adopt any draft not yet
	// consumed. `consumeDraft` tracks the draft epoch (re-runs on a new draft) and keeps the consumed
	// epoch on the shared `mentions` instance, so a draft published BEFORE this composer mounts (tab
	// switch mounts it late) is still picked up once. Plain text → set `richContent` too so it doesn't
	// drift before edit.
	$effect(() => {
		const draft = mentions.consumeDraft();
		if (draft === null) return;
		content = draft;
		richContent = draft;
	});

	const hasText = $derived(content.trim().length > 0);
	const isContentEmpty = $derived(!hasText && commands.length === 0);
	const hasComposerContext = $derived(attachments.length > 0 || contextRefs.length > 0);
	const isExpanded = $derived(
		hasComposerContext ||
			(!isContentEmpty && (content.includes('\n') || editorHeight > 34 || commands.length > 0))
	);
	const reduce = $derived(prefersReducedMotion.current);

	// DUR-6: `busy` no longer blocks submit — a message during an active run is QUEUED (server for plain
	// chat, client for the rest) via `send`/`sendDeep`, not dropped. The Stop button stays while the
	// composer is empty (see the submit button snippet).
	const canSend = $derived(
		(hasText || attachments.length > 0) && !disabled && !isSending && !hydrate.isPending
	);
	const canAttach = $derived(
		Boolean(threadId) && !disabled && !attachmentUpload.isPending && !isSending
	);

	// Countdown seconds left until `retryAt` (live tick per second).
	let nowTick = $state(Date.now());
	$effect(() => {
		if (!notice?.retryAt) return;
		const id = setInterval(() => (nowTick = Date.now()), 1000);
		return () => clearInterval(id);
	});
	const secondsLeft = $derived(
		notice?.retryAt ? Math.max(0, Math.ceil((notice.retryAt - nowTick) / 1000)) : 0
	);

	const showCredits = $derived(Boolean(billing.data) && !billing.data?.isUnlimitedCredits);
	const creditsLow = $derived(showCredits && billing.data ? isCreditsLow(billing.data) : false);

	async function submit(): Promise<void> {
		if (!canSend) return;
		isSending = true;
		uploadError = null;

		const parts: string[] = [];
		let displayText: string;
		let displayMarked: string;
		let command: 'deep' | undefined;
		if (hasText) {
			const matched = getPromptCommand(commands[0]?.id) ?? matchPromptCommandInContent(content);
			if (matched?.id === DEEP_COMMAND_ID) {
				// `/deep` → deep-research Workflow: send the QUESTION (slug stripped), not a skill expansion.
				const question = stripPromptCommandSlug(content, matched);
				if (!question.trim()) {
					isSending = false;
					return;
				}
				displayText = question;
				displayMarked = stripPromptCommandSlug(richContent, matched);
				command = 'deep';
			} else {
				const r = resolveCommandDispatch(content, commands[0]?.id);
				if (!r.displayText) {
					isSending = false;
					return;
				}
				displayText = r.displayText;
				displayMarked = richContent.trim();
				if (r.dispatchPrompt !== r.displayText) parts.push(r.dispatchPrompt);
			}
		} else {
			displayText = 'Tolong baca berkas terlampir.';
			displayMarked = displayText;
		}

		if (attachments.length > 0) {
			parts.push(`Berkas terlampir: ${attachments.map((a) => a.title).join(', ')}.`);
		}

		if (contextRefs.length > 0) {
			const {
				workspaceIds,
				artifactIds,
				paperKeys,
				feedItemIds,
				workspaceCitations,
				selections,
				documentAnnotations
			} = splitContextRefs(contextRefs);
			// Chip anotasi membawa data lengkap → konteksnya diformat lokal, tanpa hydrate server.
			if (documentAnnotations.length > 0) {
				parts.push(buildDocumentAnnotationClientContext(documentAnnotations));
			}
			const needsHydrate =
				workspaceIds.length +
					artifactIds.length +
					paperKeys.length +
					feedItemIds.length +
					workspaceCitations.length +
					selections.length >
				0;
			if (needsHydrate) {
				try {
					const hydrated = await hydrate.mutateAsync({
						workspaceIds,
						artifactIds,
						paperKeys,
						feedItemIds,
						workspaceCitations,
						selections
					});
					if (hydrated.note) parts.push(hydrated.note);
				} catch {
					// Hydrate failure (e.g. network) → send without the context note rather than block.
				}
			}
		}

		const attachmentIds = attachments.map((a) => a.artifactId);
		// Snapshot pin SEBELUM clearing — callback pasca-kirim (mark-sent anotasi) membacanya dari payload.
		const sentRefs = contextRefs;
		content = '';
		richContent = '';
		commands = [];
		contextRefs = [];
		mentions.clearSelectionRefs();
		attachments = [];
		isSending = false;
		onSend({
			text: displayText,
			richText: displayMarked.includes(MENTION_MARKER_OPEN) ? displayMarked : undefined,
			clientContext: parts.length > 0 ? parts : undefined,
			contextRefs: sentRefs.length > 0 ? sentRefs : undefined,
			agentKind: agentSelection.agentKind,
			command,
			attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined
		});
	}

	async function onPickFile(file: File | undefined): Promise<void> {
		if (!file || !threadId) return;
		uploadError = null;
		const res = await attachmentUpload.mutateAsync({ file }).catch(() => null);
		if (res) {
			attachments = [
				...attachments,
				{ artifactId: res.artifactId, title: res.title, indexingStatus: res.indexingStatus }
			];
		} else {
			uploadError = `Gagal melampirkan ${file.name}.`;
		}
	}

	function onRemoveAttachment(id: string): void {
		const removed = attachments.find((a) => a.artifactId === id);
		attachments = attachments.filter((a) => a.artifactId !== id);
		if (threadId && removed) {
			removeAttachment.mutate(
				{ artifactId: id },
				{
					onError: () => {
						if (!attachments.some((a) => a.artifactId === id))
							attachments = [...attachments, removed];
					}
				}
			);
		}
	}

	function onEscape(event: KeyboardEvent): void {
		if (event.key === 'Escape' && !event.defaultPrevented && busy && onStop) onStop();
	}
</script>

<div class={cn('flex w-full flex-col', showLandingSuggestions ? 'gap-3' : 'gap-8')}>
	{#if showLandingSuggestions && !disabled}
		<ComposerSuggestionList
			landing
			onSelectSuggestion={(prompt) => {
				commands = [];
				content = prompt;
			}}
		/>
	{/if}

	<div
		bind:this={composerShellEl}
		class="aqsha-composer-shell @container/composer w-full text-foreground"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="flex flex-col justify-between overflow-hidden bg-transparent text-left"
			onkeydown={onEscape}
		>
			<input
				bind:this={fileInputEl}
				type="file"
				class="hidden"
				onchange={(e) => {
					const target = e.currentTarget;
					void onPickFile(target.files?.[0] ?? undefined);
					target.value = '';
				}}
			/>

			{#if notice}
				{@const isCooldown = Boolean(notice.retryAt)}
				<div
					class="grid gap-2 border-b border-border px-4 py-2.5"
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					{#if isCooldown}
						<div
							class="rounded-lg border-2 border-lemon-soft-border bg-lemon-soft px-2.5 py-2 text-label font-medium leading-5 text-lemon-foreground"
						>
							{notice.message}{secondsLeft > 0 ? ` (${secondsLeft} detik)` : ''}
						</div>
					{:else}
						<div
							class="rounded-lg border-2 border-coral-soft-border bg-coral-soft px-2.5 py-2 text-label font-medium leading-5 text-coral-foreground"
						>
							{notice.message}
							<a
								href={resolve('/app/settings/usage-billing')}
								class="font-semibold underline underline-offset-2">Buka Billing</a
							>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Attachment / upload-error chip row -->
			{#if attachmentsView.length > 0 || uploadError}
				<div
					class="flex flex-wrap items-center gap-2 px-3.5 pt-3 pb-1"
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					{#each attachmentsView as file (file.artifactId)}
						<FileChip
							id={file.artifactId}
							title={file.title}
							indexingStatus={file.indexingStatus}
							onRemove={isSending ? undefined : () => onRemoveAttachment(file.artifactId)}
						/>
					{/each}
					{#if uploadError}
						<div
							class="inline-flex max-w-full min-h-7 items-start gap-1.5 rounded-full border-2 border-coral-soft-border bg-coral-soft px-2.5 py-1 text-label font-medium leading-5 text-coral-foreground"
						>
							<Icon icon={AlertCircleIcon} class="mt-0.5 size-3.5 shrink-0" />
							<span>{uploadError}</span>
						</div>
					{/if}
				</div>
			{/if}

			<div
				class={cn(
					// Restructure atomically (no partial padding/gap easing while flex-direction snaps).
					'flex min-h-0 w-full',
					isExpanded
						? cn('flex-col gap-3 p-3.5 pt-2 pb-2.5', showSuggestions && 'p-4 pt-3 pb-3')
						: cn(
								'flex-row items-center gap-2 py-1 pr-1.5 pl-2',
								showSuggestions ? 'min-h-[64px] pr-2.5 pl-3' : 'min-h-[46px]'
							)
				)}
			>
				<div
					class={cn(
						'flex min-w-0 flex-1',
						isExpanded ? 'w-full items-start px-1' : 'items-center gap-2'
					)}
				>
					{#if !isExpanded}
						{@render uploadButton()}
					{/if}
					<div class="min-w-0 flex-1">
						<TokenizedPromptInput
							value={content}
							onValueChange={(v) => (content = v)}
							onRichValueChange={(v) => (richContent = v)}
							onCommandsChange={(c) => (commands = c)}
							onHeightChange={(h) => (editorHeight = h)}
							onSubmit={() => void submit()}
							{disabled}
							maxLength={MAX_LENGTH}
							isCollapsed={!isExpanded}
							placeholder={resolvedPlaceholder}
							class={isExpanded ? 'py-0.5' : undefined}
							pinnedContextRefs={contextRefs}
							onContextRefsChange={handleContextRefsChange}
							{contextWorkspaces}
							{ambientWorkspaceId}
							{workspaceItems}
							workspaceItemsLoading={contextItemsQuery.isLoading}
							bind:drillWorkspaceId
							mobilePaletteAnchor={composerShellEl}
						/>
					</div>
				</div>

				<div
					class={cn(
						'flex shrink-0 items-center gap-1',
						isExpanded && 'w-full justify-between pt-1'
					)}
				>
					{#if isExpanded}
						{@render uploadButton()}
					{/if}
					<div class="flex shrink-0 items-center gap-1">
						<AgentSelector
							agentKind={agentSelection.agentKind}
							setAgentKind={agentSelection.setAgentKind}
							canUsePro={agentSelection.canUsePro}
							onUpgrade={agentSelection.handleUpgrade}
							{disabled}
						/>
						{@render submitButton()}
					</div>
				</div>
			</div>
		</div>

		{#if !disabled}
			<!-- Affordance hint -->
			<div
				class="flex items-center gap-2 border-t border-border bg-muted/30 px-3.5 py-2 text-muted-foreground"
			>
				<p
					class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-label font-medium leading-4"
				>
					{@render hintKey('@')}
					<span>tautkan konteks</span>
					<span aria-hidden="true">·</span>
					{@render hintKey('/')}
					<span>jalankan perintah</span>
					{#if showCredits && billing.data}
						<span aria-hidden="true">·</span>
						<span class={cn(creditsLow && 'text-lemon-foreground')}>
							sisa {billing.data.creditsRemaining.toLocaleString('id-ID')} kredit
						</span>
					{/if}
				</p>
			</div>
		{/if}
	</div>

	{#if showSuggestions && !disabled}
		<ComposerStartPanel
			{recentThreads}
			onSelectSuggestion={(prompt) => {
				commands = [];
				content = prompt;
			}}
			onSelectThread={(id) => {
				// Threads live under their project; only navigable with the current project's id.
				if (ambientWorkspaceId)
					void goto(
						resolve('/app/(product)/projects/[projectId]/threads/[threadId]', {
							projectId: ambientWorkspaceId,
							threadId: id
						})
					);
			}}
		/>
	{/if}
</div>

{#snippet hintKey(label: string)}
	<kbd
		class="lip-static inline-flex h-5 min-w-5 items-center justify-center rounded-sm border-2 border-border bg-background px-1 font-mono text-micro font-semibold leading-none text-foreground"
	>
		{label}
	</kbd>
{/snippet}

{#snippet uploadButton()}
	<Button
		variant="ghost"
		size="icon-sm"
		disabled={!canAttach}
		onclick={() => fileInputEl?.click()}
		class="shrink-0 rounded-full"
		title={threadId ? 'Lampirkan berkas' : 'Kirim pesan dulu untuk melampirkan berkas'}
		aria-label="Lampirkan berkas"
	>
		{#if attachmentUpload.isPending}
			<Icon icon={Loader2Icon} class="size-3.5 animate-spin" />
		{:else}
			<Icon icon={PaperclipIcon} class="size-3.5" />
		{/if}
	</Button>
{/snippet}

{#snippet submitButton()}
	{#if busy && onStop && !canSend}
		<Button variant="destructive" size="sm" onclick={onStop} class="shrink-0" aria-label="Hentikan">
			<Icon icon={SquareIcon} class="size-3" />
			Stop
		</Button>
	{:else}
		<Button
			size="icon-sm"
			onclick={() => void submit()}
			disabled={!canSend}
			aria-label="Kirim"
			class="shrink-0"
		>
			{#if isSending}
				<Icon icon={Loader2Icon} class="size-3.5 animate-spin" />
			{:else}
				<Icon icon={ArrowUpIcon} class="size-3.5" />
			{/if}
		</Button>
	{/if}
{/snippet}
