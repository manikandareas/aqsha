<script lang="ts">
	import { untrack } from 'svelte';
	import { prefersReducedMotion } from 'svelte/motion';
	import { slide } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { toast } from 'svelte-sonner';
	import {
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
	import { cn } from '$lib/utils';
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
	import FileChip from './FileChip.svelte';
	import TokenizedPromptInput from './TokenizedPromptInput.svelte';
	import type {
		ComposerAttachment,
		ComposerNotice,
		ComposerSendPayload,
		RecentThread
	} from './composer-types';
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
		showSuggestions?: boolean;
		recentThreads?: RecentThread[];
		initialContent?: string;
		placeholder?: ComposerPlaceholder;
	} = $props();

	const resolvedPlaceholder: ComposerPlaceholder = $derived(
		placeholder ?? { narrow: 'Tulis pesan…', wide: 'Tulis pesan untuk Astra…' }
	);

	const mentions = getComposerMentions();

	let content = $state(untrack(() => initialContent ?? ''));
	let richContent = $state(untrack(() => initialContent ?? ''));
	let commands = $state<PromptCommand[]>([]);
	let contextRefs = $state<ContextRef[]>([]);
	let attachments = $state<ComposerAttachment[]>([]);
	// @mention workspace picker: the workspace list feeds the top-level palette; drilling into a
	// workspace fetches its context-picker artifacts on demand (query dormant until `drillWorkspaceId`
	// is set by the tokenized editor's `onRequestWorkspaceItems`).
	let drillWorkspaceId = $state<string | null>(null);
	const workspacesQuery = useWorkspacesList(() => false);
	const contextItemsQuery = useContextPickerArtifacts(() => drillWorkspaceId);
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
	const billing = useBillingCurrent();

	// D5: large attachments index async (initial `pending`). Poll the thread artifact list ONLY while a
	// pending upload exists; the live chip status is derived from the poll (not duplicated in local state) +
	// a one-time toast per artifact if indexing fails.
	const hasPendingUpload = $derived(attachments.some((a) => a.indexingStatus === 'pending'));
	const threadArtifacts = useThreadArtifacts(() => (hasPendingUpload ? (threadId ?? null) : null), {
		pollWhilePending: true
	});
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

	/**
	 * Merge-pin reconciler shared by the two epoch merges (ambient + library selection): drop `removeKeys`
	 * from the current set, then prepend `addRefs` not already present (dedup by key). One place so a fix
	 * (e.g. key/order comparison) never misses a path. Pure reconciler.
	 */
	function reconcilePinnedRefs(
		current: ContextRef[],
		removeKeys: Set<string>,
		addRefs: ContextRef[]
	): ContextRef[] {
		const kept = current.filter((ref) => !removeKeys.has(contextRefKey(ref)));
		const keptKeys = new Set(kept.map(contextRefKey));
		const toAdd = addRefs.filter((ref) => !keptKeys.has(contextRefKey(ref)));
		return [...toAdd, ...kept];
	}

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

	// Ambient auto-mention (page context / "Tanya Astra"): epoch-driven merge (documented $effect, not a
	// derived reflex). Drop ALL ambient tokens (old + new), keep MANUAL tokens, prepend current ambient.
	let ambientMerge = { epoch: -1, refs: [] as ContextRef[] };
	$effect(() => {
		const epoch = mentions.ambientEpoch;
		if (epoch === ambientMerge.epoch) return;
		const ambientRefs = mentions.ambientContextRefs;
		const ambientKeys = new Set([...ambientMerge.refs, ...ambientRefs].map(contextRefKey));
		ambientMerge = { epoch, refs: ambientRefs };
		contextRefs = reconcilePinnedRefs(
			untrack(() => contextRefs),
			ambientKeys,
			ambientRefs
		);
	});

	// Library selection ("click-once = context") → `@paper` pills. Same epoch-merge: drop selection pills
	// no longer selected, insert new, KEEP other pills (manual/ambient).
	let selectionMerge = { epoch: -1, keys: [] as string[] };
	$effect(() => {
		const epoch = mentions.selectionEpoch;
		if (epoch === selectionMerge.epoch) return;
		const selectionRefs = mentions.selectionRefs;
		const nextKeys = selectionRefs.map(contextRefKey);
		const nextKeySet = new Set(nextKeys);
		const removedKeys = new Set(selectionMerge.keys.filter((k) => !nextKeySet.has(k)));
		selectionMerge = { epoch, keys: nextKeys };
		contextRefs = reconcilePinnedRefs(
			untrack(() => contextRefs),
			removedKeys,
			selectionRefs
		);
	});

	// Two-way sync: a selection pill removed by the user in the editor → deselect the library card. Only
	// fires from editor events (not programmatic injection), so a selected `paper` ref gone from `next`
	// was genuinely removed by the user.
	function handleContextRefsChange(next: ContextRef[]): void {
		if (mentions.selectionRefs.length > 0) {
			const nextKeys = new Set(next.map(contextRefKey));
			for (const ref of mentions.selectionRefs) {
				if (ref.kind === 'paper' && !nextKeys.has(contextRefKey(ref))) {
					mentions.removeSelectionArtifact(ref.artifactId);
				}
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

	// Prefill composer text (stats next-step chip) — overwrite `content` when the draft epoch rises.
	// rises. Plain text → also set `richContent` so it doesn't drift before edit.
	let seenDraftEpoch = mentions.draftEpoch;
	$effect(() => {
		const epoch = mentions.draftEpoch;
		if (epoch === seenDraftEpoch) return;
		seenDraftEpoch = epoch;
		content = mentions.draftContent;
		richContent = mentions.draftContent;
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
			const { workspaceIds, artifactIds, paperKeys, feedItemIds, workspaceCitations, selections } =
				splitContextRefs(contextRefs);
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

		const attachmentIds = attachments.map((a) => a.artifactId);
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

<div class="flex w-full flex-col gap-8">
	<div
		bind:this={composerShellEl}
		class="@container/composer w-full overflow-hidden rounded-[24px] border border-border/85 bg-card/95 text-foreground"
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
					class="grid gap-2 border-b border-border/60 px-4 py-2.5"
					transition:slide={reduce ? { duration: 0 } : { duration: 180 }}
				>
					{#if isCooldown}
						<div
							class="rounded-lg border border-lemon-soft-border bg-lemon-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-lemon-foreground"
						>
							{notice.message}{secondsLeft > 0 ? ` (${secondsLeft} detik)` : ''}
						</div>
					{:else}
						<div
							class="rounded-lg border border-coral-soft-border bg-coral-soft px-2.5 py-2 text-[11px] font-medium leading-5 text-coral-foreground"
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
							class="inline-flex max-w-full min-h-7 items-start gap-1.5 rounded-full border border-coral-soft-border bg-coral-soft px-2.5 py-1 text-[11px] font-medium leading-5 text-coral-foreground"
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
						? 'flex-col gap-3 p-3.5 pt-2 pb-2.5'
						: 'min-h-[46px] flex-row items-center gap-2 py-1 pr-1.5 pl-2'
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
							onRequestWorkspaceItems={(id) => (drillWorkspaceId = id)}
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
				class="flex items-center gap-2 border-t border-border/50 bg-foreground/[0.02] px-3.5 py-2 text-muted-foreground"
			>
				<p
					class="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] font-medium leading-4"
				>
					{@render hintKey('@')}
					<span>tautkan konteks</span>
					<span class="text-muted-foreground/40" aria-hidden="true">·</span>
					{@render hintKey('/')}
					<span>jalankan perintah</span>
					{#if showCredits && billing.data}
						<span class="text-muted-foreground/40" aria-hidden="true">·</span>
						<span class={cn(creditsLow && 'text-amber-600 dark:text-amber-500')}>
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
			onSelectThread={(id) => goto(resolve('/app/(product)/threads/[threadId]', { threadId: id }))}
		/>
	{/if}
</div>

{#snippet hintKey(label: string)}
	<kbd
		class="inline-flex h-4 min-w-4 items-center justify-center rounded-[5px] border border-border/70 bg-background px-1 font-mono text-[10px] font-semibold leading-none text-foreground"
	>
		{label}
	</kbd>
{/snippet}

{#snippet uploadButton()}
	<button
		type="button"
		disabled={!canAttach}
		onclick={() => fileInputEl?.click()}
		class="aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-all duration-150 hover:bg-muted/30 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
		title={threadId ? 'Lampirkan berkas' : 'Kirim pesan dulu untuk melampirkan berkas'}
		aria-label="Lampirkan berkas"
	>
		{#if attachmentUpload.isPending}
			<Icon icon={Loader2Icon} class="size-3.5 animate-spin" />
		{:else}
			<Icon icon={PaperclipIcon} class="size-3.5" />
		{/if}
	</button>
{/snippet}

{#snippet submitButton()}
	{#if busy && onStop && !canSend}
		<button
			type="button"
			onclick={onStop}
			class="aqsha-composer-toolbar-btn inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-coral-soft-border bg-coral-soft px-2.5 text-[11px] font-semibold text-coral-foreground hover:bg-coral-soft"
			aria-label="Hentikan"
		>
			<Icon icon={SquareIcon} class="size-3" />
			Stop
		</button>
	{:else}
		<button
			type="button"
			onclick={() => void submit()}
			disabled={!canSend}
			aria-label="Kirim"
			class={cn(
				'aqsha-composer-toolbar-btn flex size-8 shrink-0 items-center justify-center rounded-full shadow-none transition-all duration-200 active:scale-95',
				!canSend && 'cursor-not-allowed bg-muted/30 text-muted-foreground/30'
			)}
		>
			{#if isSending}
				<Icon icon={Loader2Icon} class="size-3.5 animate-spin" />
			{:else}
				<Icon icon={ArrowUpIcon} class="size-3.5" />
			{/if}
		</button>
	{/if}
{/snippet}
