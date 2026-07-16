<script lang="ts">
	import { PinInput as InputOTPPrimitive } from 'bits-ui';
	import { cn } from '../../utils.js';

	let {
		ref = $bindable(null),
		class: className,
		value = $bindable(''),
		maxlength,
		...restProps
	}: InputOTPPrimitive.RootProps = $props();

	// Filled state drives the mint "done" treatment on every cell (see input-otp-slot).
	// bits-ui forwards unknown attrs to its hidden input, so cells read the flag via
	// `group-has-[[data-complete]]`, not `group-data-*`.
	const complete = $derived(
		typeof maxlength === 'number' && maxlength > 0 && value.length >= maxlength
	);
</script>

<InputOTPPrimitive.Root
	bind:ref
	bind:value
	{maxlength}
	data-slot="input-otp"
	data-complete={complete ? '' : undefined}
	spellcheck={false}
	class={cn(
		'cn-input-otp-input group/input-otp gap-2 flex items-center disabled:cursor-not-allowed has-disabled:opacity-50',
		className
	)}
	{...restProps}
/>
