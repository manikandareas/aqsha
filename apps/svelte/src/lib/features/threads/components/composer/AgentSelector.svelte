<script lang="ts">
	import * as DropdownMenu from '@aqsha/ui-svelte/components/dropdown-menu';
	import { Icon, ChevronDownIcon, LockIcon } from '$lib/icons';
	import { cn } from '@aqsha/ui-svelte/utils';
	import type { ComposerAgentKind } from './agent-selection.svelte';

	let {
		agentKind,
		setAgentKind,
		canUsePro,
		onUpgrade,
		disabled = false
	}: {
		agentKind: ComposerAgentKind;
		setAgentKind: (agentKind: ComposerAgentKind) => void;
		canUsePro: boolean;
		onUpgrade: () => void;
		disabled?: boolean;
	} = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				{disabled}
				class="inline-flex h-8 cursor-pointer items-center gap-1 rounded-full bg-muted/20 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-all duration-150 hover:bg-muted/40 hover:text-foreground disabled:opacity-50"
			>
				<img
					src={agentKind === 'pro' ? '/pro-agent.png' : '/general-agent.png'}
					alt=""
					width="16"
					height="16"
					class="size-4 rounded-full object-cover"
				/>
				<span>{agentKind === 'pro' ? 'Pro' : 'Lite'}</span>
				<Icon icon={ChevronDownIcon} class="size-3 text-muted-foreground/60" />
			</button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-44">
		<DropdownMenu.Item
			onSelect={() => setAgentKind('lite')}
			class={cn('gap-2 rounded-lg', agentKind === 'lite' && 'bg-sky-soft/60 font-medium')}
		>
			<img
				src="/general-agent.png"
				alt=""
				width="20"
				height="20"
				class="size-5 rounded-full object-cover"
			/>
			<span class="text-[11px] font-semibold">Astra Lite</span>
		</DropdownMenu.Item>
		<DropdownMenu.Item
			onSelect={() => {
				if (canUsePro) setAgentKind('pro');
				else onUpgrade();
			}}
			class={cn('gap-2 rounded-lg', agentKind === 'pro' && 'bg-sky-soft/60 font-medium')}
		>
			<img
				src="/pro-agent.png"
				alt=""
				width="20"
				height="20"
				class="size-5 rounded-full object-cover"
			/>
			<span class="text-[11px] font-semibold">Astra Pro</span>
			{#if !canUsePro}
				<Icon icon={LockIcon} class="ml-auto size-3 text-muted-foreground/70" />
			{/if}
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>
