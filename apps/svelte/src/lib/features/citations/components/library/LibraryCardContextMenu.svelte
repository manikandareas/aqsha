<script lang="ts">
	import * as ContextMenu from '@aqsha/ui-svelte/components/context-menu';
	import {
		CopyIcon,
		ExternalLinkIcon,
		Icon,
		PenLineIcon,
		Trash2Icon,
		type IconSvgElement
	} from '$lib/icons';

	/**
	 * Menu kartu perpustakaan. Isi aksinya disuplai pemanggil supaya menu tidak
	 * menyimpulkan scope sendiri — perilaku "tambah ke proyek" vs "lepas dari proyek"
	 * ditentukan halaman, bukan komponen ini.
	 */
	let {
		title,
		externalHref,
		readerHref,
		membershipAction,
		onOpenDetail,
		onEdit,
		onCopy,
		onSelectMany,
		onDelete,
		children
	}: {
		title: string;
		externalHref: string | null;
		/** Null bila item belum punya paper untuk dibuka. */
		readerHref: string | null;
		membershipAction: { label: string; icon: IconSvgElement; run: () => void };
		onOpenDetail: () => void;
		onEdit: () => void;
		onCopy: () => void;
		onSelectMany: () => void;
		onDelete: () => void;
		children: import('svelte').Snippet;
	} = $props();
</script>

<ContextMenu.Root>
	<ContextMenu.Trigger class="block">
		{@render children()}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-56">
		<ContextMenu.Label class="truncate">{title}</ContextMenu.Label>
		{#if readerHref}
			<ContextMenu.Item onSelect={() => (window.location.href = readerHref)}>
				Buka paper
			</ContextMenu.Item>
		{/if}
		<ContextMenu.Item onSelect={onOpenDetail}>Lihat detail</ContextMenu.Item>
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onCopy}>
			<Icon icon={CopyIcon} class="size-4" />
			Salin sitasi
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={onEdit}>
			<Icon icon={PenLineIcon} class="size-4" />
			Edit
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={membershipAction.run}>
			<Icon icon={membershipAction.icon} class="size-4" />
			{membershipAction.label}
		</ContextMenu.Item>
		{#if externalHref}
			<ContextMenu.Item onSelect={() => window.open(externalHref, '_blank', 'noopener')}>
				<Icon icon={ExternalLinkIcon} class="size-4" />
				Buka sumber
			</ContextMenu.Item>
		{/if}
		<ContextMenu.Separator />
		<ContextMenu.Item onSelect={onSelectMany}>Pilih beberapa</ContextMenu.Item>
		<ContextMenu.Item variant="destructive" onSelect={onDelete}>
			<Icon icon={Trash2Icon} class="size-4" />
			Hapus
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
