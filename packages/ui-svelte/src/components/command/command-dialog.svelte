<script lang="ts">
	import type { Command as CommandPrimitive, Dialog as DialogPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Command from './command.svelte';
	import * as Dialog from '../dialog/index.js';
	import { cn, type WithoutChildrenOrChild } from '../../utils.js';

	let {
		open = $bindable(false),
		ref = $bindable(null),
		value = $bindable(''),
		title = 'Command Palette',
		description = 'Search for a command to run...',
		showCloseButton = false,
		portalProps,
		children,
		class: className,
		...commandProps
	}: WithoutChildrenOrChild<CommandPrimitive.RootProps> & {
		open?: boolean;
		portalProps?: DialogPrimitive.PortalProps;
		children: Snippet;
		title?: string;
		description?: string;
		showCloseButton?: boolean;
		class?: string;
	} = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Header class="sr-only">
		<Dialog.Title>{title}</Dialog.Title>
		<Dialog.Description>{description}</Dialog.Description>
	</Dialog.Header>
	<Dialog.Content
		class={cn('rounded-lg! top-1/3 translate-y-0 overflow-hidden p-0 sm:max-w-2xl', className)}
		{showCloseButton}
		{portalProps}
	>
		<Command
			class="rounded-none border-0 bg-transparent shadow-none"
			{...commandProps}
			bind:value
			bind:ref
			{children}
		/>
	</Dialog.Content>
</Dialog.Root>
