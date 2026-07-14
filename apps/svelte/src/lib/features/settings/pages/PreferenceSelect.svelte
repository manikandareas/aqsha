<script lang="ts">
	import * as Select from '$lib/components/ui/select';

	/**
	 * Single-select wrapper — port of the local `PreferenceSelect` in web personalization-page.tsx.
	 * bits-ui Select has no `<SelectValue />`, so the trigger renders the selected option's label.
	 */
	let {
		value,
		onValueChange,
		options,
		disabled
	}: {
		value: string;
		onValueChange: (v: string) => void;
		options: Array<{ id: string; label: string }>;
		disabled?: boolean;
	} = $props();

	const selectedLabel = $derived(options.find((o) => o.id === value)?.label ?? '');
</script>

<Select.Root type="single" {value} {onValueChange} {disabled}>
	<Select.Trigger class="w-56 max-w-full">{selectedLabel}</Select.Trigger>
	<Select.Content align="end">
		{#each options as o (o.id)}
			<Select.Item value={o.id} label={o.label}>{o.label}</Select.Item>
		{/each}
	</Select.Content>
</Select.Root>
