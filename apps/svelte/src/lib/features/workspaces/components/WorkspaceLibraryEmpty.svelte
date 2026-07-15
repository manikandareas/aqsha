<script lang="ts">
	import { Icon, FileTextIcon, FolderIcon, UploadIcon } from '$lib/icons';
	import { Button } from '$lib/components/ui/button';

	/**
	 * Centered empty-state for the workspace library board — port of
	 * `apps/web/features/workspaces/components/workspace-library-empty.tsx`. A category pill (icon +
	 * context label) on top, a short message, a hairline connector, then the create actions stacked
	 * below. Vertically + horizontally centered inside the board body.
	 */
	let {
		variant,
		badgeLabel,
		badgeEmoji,
		title,
		description,
		showActions = true,
		onCreateFolder,
		onCreateDocument,
		onCreateUrl
	}: {
		variant: 'root' | 'folder';
		badgeLabel?: string;
		badgeEmoji?: string;
		title?: string;
		description?: string;
		showActions?: boolean;
		onCreateFolder?: () => void;
		onCreateDocument?: () => void;
		onCreateUrl?: () => void;
	} = $props();

	const isRoot = $derived(variant === 'root');
	const resolvedBadge = $derived(badgeLabel ?? (isRoot ? 'Pustaka' : 'Folder'));
	const resolvedTitle = $derived(
		title ?? (isRoot ? 'Kumpulkan paper-mu di sini' : 'Folder ini masih kosong')
	);
	const resolvedDescription = $derived(
		description ??
			(isRoot
				? 'Simpan dokumen, file, atau URL untuk mulai membangun perpustakaan risetmu.'
				: 'Tambahkan dokumen atau URL ke folder ini.')
	);

	const showDocument = $derived(showActions && Boolean(onCreateDocument));
	const showUpload = $derived(showActions && Boolean(onCreateUrl));
	const showFolder = $derived(showActions && isRoot && Boolean(onCreateFolder));
	const hasActions = $derived(showDocument || showUpload || showFolder);
</script>

<div class="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
	<!-- Category pill — echoes the active context. When the workspace has an emoji it renders bare
	     (no tinted chip); otherwise a lavender-tinted icon chip stands in for the reference's colour dot. -->
	<div
		class="inline-flex items-center gap-2.5 rounded-full border border-border/70 bg-background/70 py-2 pl-3.5 pr-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] backdrop-blur-sm"
	>
		{#if badgeEmoji}
			<span class="text-xl leading-none">{badgeEmoji}</span>
		{:else}
			<span
				class="grid size-7 place-items-center rounded-full bg-lavender-soft text-lavender-foreground ring-1 ring-inset ring-lavender-soft-border"
			>
				<Icon icon={FileTextIcon} class="size-4" />
			</span>
		{/if}
		<span class="font-heading text-base font-semibold text-foreground">
			{resolvedBadge}
		</span>
	</div>

	<div class="mt-5 grid max-w-[17rem] gap-1.5">
		<p class="text-[15px] font-semibold text-foreground">
			{resolvedTitle}
		</p>
		<p class="text-[13px] font-medium leading-relaxed text-muted-foreground">
			{resolvedDescription}
		</p>
	</div>

	{#if hasActions}
		<!-- Hairline connector linking the message to the actions below. -->
		<div
			aria-hidden="true"
			class="my-6 h-14 w-px bg-gradient-to-b from-transparent via-border to-transparent"
		></div>
		<div class="flex flex-col items-center gap-2">
			{#if showDocument}
				<Button type="button" class="rounded-full px-4" onclick={onCreateDocument}>
					<Icon icon={FileTextIcon} class="size-4" />
					Dokumen
				</Button>
			{/if}
			{#if showUpload}
				<Button type="button" variant="secondary" class="rounded-full px-4" onclick={onCreateUrl}>
					<Icon icon={UploadIcon} class="size-4" />
					Upload
				</Button>
			{/if}
			{#if showFolder}
				<Button
					type="button"
					variant="secondary"
					class="rounded-full px-4"
					onclick={onCreateFolder}
				>
					<Icon icon={FolderIcon} class="size-4" />
					Folder
				</Button>
			{/if}
		</div>
	{/if}
</div>
