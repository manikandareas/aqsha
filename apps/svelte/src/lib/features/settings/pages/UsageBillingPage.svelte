<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Icon, CheckIcon, ExternalLinkIcon, Loader2Icon } from '$lib/icons';
	import { readableApiErrorMessage } from '$lib/errors';
	import { cn } from '$lib/utils';
	import {
		type ProductKey,
		useBillingCurrent,
		useBillingPlans,
		useCancelSubscription,
		useChangeSubscription,
		useCheckout,
		usePortal,
		useUsageActivity
	} from '../api';
	import { formatIdr } from '../lib/format';
	import CreditMeter from '../components/CreditMeter.svelte';
	import UsageChart from '../components/UsageChart.svelte';
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import {
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsPill,
		SettingsSegmentedControl
	} from '../components/settings-card';

	const WINDOWS = [30, 90, 365] as const;

	const billing = useBillingCurrent();
	const plans = useBillingPlans();
	let days = $state<(typeof WINDOWS)[number]>(30);
	const usage = useUsageActivity(() => days);

	const checkout = useCheckout();
	const change = useChangeSubscription();
	const cancel = useCancelSubscription();
	const portal = usePortal();

	const hasSubscription = $derived(billing.data?.canChangeSubscription ?? false);
	const pendingPurchase = $derived(checkout.isPending || change.isPending);

	function onSelectProduct(productKey: ProductKey) {
		if (hasSubscription) change.mutate(productKey);
		else checkout.mutate(productKey);
	}
</script>

<SettingsHeader
	section="usage-billing"
	title="Penggunaan & tagihan"
	description="Kelola paket, pantau kredit, dan buka portal billing."
/>

<!-- Paket aktif + aksi -->
<SettingsPanel>
	<SettingsPanelHeader
		title="Paket aktif"
		description={billing.isPending
			? 'Memuat…'
			: billing.data
				? billing.data.planLabel
				: 'Tidak tersedia'}
	>
		{#snippet action()}
			{#if billing.data}
				<SettingsPill>{billing.data.isAdmin ? 'Admin' : billing.data.status}</SettingsPill>
			{/if}
		{/snippet}
	</SettingsPanelHeader>
	<SettingsPanelBody class="space-y-3">
		{#if billing.isPending}
			<p class="text-[13px] text-muted-foreground">Memuat billing…</p>
		{:else if billing.data}
			<CreditMeter
				creditsUsed={billing.data.creditsUsed}
				creditsLimit={billing.data.creditsLimit}
				creditsRemaining={billing.data.creditsRemaining}
				unlimited={billing.data.isUnlimitedCredits}
				resetAt={billing.data.resetAt}
			/>
		{:else}
			<p class="text-[13px] text-destructive">
				{readableApiErrorMessage(billing.error, 'Tidak dapat memuat billing.')}
			</p>
		{/if}
		{#if billing.data?.cancelAtPeriodEnd}
			<p class="text-[12px] text-coral-foreground">
				Langganan akan berakhir pada akhir periode berjalan.
			</p>
		{/if}
	</SettingsPanelBody>
	{#if billing.data?.billingPortalAvailable || billing.data?.canCancelSubscription}
		<SettingsPanelFooter>
			{#if billing.data?.billingPortalAvailable}
				<Button
					variant="outline"
					size="sm"
					onclick={() => portal.mutate()}
					disabled={portal.isPending}
				>
					{#if portal.isPending}
						<Icon icon={Loader2Icon} class="size-4 animate-spin" />
					{:else}
						<Icon icon={ExternalLinkIcon} class="size-4" />
					{/if}
					Kelola tagihan
				</Button>
			{/if}
			{#if billing.data?.canCancelSubscription}
				<Button
					variant="ghost"
					size="sm"
					onclick={() => cancel.mutate()}
					disabled={cancel.isPending}
				>
					{#if cancel.isPending}
						<Icon icon={Loader2Icon} class="size-4 animate-spin" />
					{/if}
					Batalkan langganan
				</Button>
			{/if}
		</SettingsPanelFooter>
	{/if}
</SettingsPanel>

<!-- Daftar plan + produk -->
<SettingsPanel>
	<SettingsPanelHeader
		title="Paket tersedia"
		description="Pilih paket yang sesuai kebutuhan riset kamu."
	/>
	<SettingsPanelBody>
		{#if plans.isPending}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each [0, 1, 2, 3] as i (i)}
					<div class="h-44 animate-pulse rounded-xl border border-border/60 bg-muted/40"></div>
				{/each}
			</div>
		{:else if !plans.data}
			<p class="text-[13px] text-destructive">
				{readableApiErrorMessage(plans.error, 'Tidak dapat memuat daftar paket.')}
			</p>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2">
				{#each plans.data as plan (plan.key)}
					{@const isCurrent = billing.data?.planKey === plan.key}
					<div
						class={cn(
							'flex flex-col gap-3 rounded-xl border bg-card p-4',
							isCurrent ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border/70'
						)}
					>
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="text-[14px] font-semibold tracking-tight text-foreground">
									{plan.label}
								</p>
								<p class="mt-0.5 text-[12px] text-muted-foreground">
									{formatIdr(plan.monthlyPriceIdr)}{plan.monthlyPriceIdr > 0 ? '/bln' : ''}
								</p>
							</div>
							{#if isCurrent}
								<SettingsPill class="border-primary/40 text-primary">Saat ini</SettingsPill>
							{/if}
						</div>

						<ul class="space-y-1.5 text-[12px] text-muted-foreground">
							{#each plan.features as f (f)}
								<li class="flex items-start gap-2">
									<Icon icon={CheckIcon} class="mt-0.5 size-3.5 shrink-0 text-primary" />
									{f}
								</li>
							{/each}
						</ul>

						{#if plan.products.length > 0}
							<div class="mt-auto flex flex-col gap-2 pt-1">
								{#each plan.products as product (product.key)}
									<Button
										variant={product.interval === 'month' ? 'default' : 'outline'}
										size="sm"
										disabled={!product.configured ||
											pendingPurchase ||
											(isCurrent && product.key === billing.data?.productKey)}
										onclick={() => onSelectProduct(product.key)}
									>
										{#if pendingPurchase}
											<Icon icon={Loader2Icon} class="size-4 animate-spin" />
										{/if}
										{`${formatIdr(product.displayPriceIdr)}/${product.interval === 'month' ? 'bln' : 'thn'}`}{!product.configured
											? ' (belum tersedia)'
											: ''}
									</Button>
								{/each}
							</div>
						{:else}
							<p class="mt-auto text-[12px] text-muted-foreground">
								Paket dasar — tidak perlu pembayaran.
							</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</SettingsPanelBody>
</SettingsPanel>

<!-- Usage timeseries dengan toggle window -->
<SettingsPanel>
	<SettingsPanelHeader title="Penggunaan" description="Kredit terpakai per hari">
		{#snippet action()}
			<SettingsSegmentedControl>
				{#each WINDOWS as w (w)}
					{@const active = days === w}
					<button
						type="button"
						onclick={() => (days = w)}
						class={cn(
							'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors duration-150',
							active
								? 'border border-border/40 bg-card text-foreground'
								: 'text-muted-foreground hover:text-foreground'
						)}
					>
						{w}h
					</button>
				{/each}
			</SettingsSegmentedControl>
		{/snippet}
	</SettingsPanelHeader>
	<SettingsPanelBody>
		{#if usage.isPending}
			<p class="text-[13px] text-muted-foreground">Memuat penggunaan…</p>
		{:else if usage.data}
			<UsageChart days={usage.data} />
		{:else}
			<p class="text-[13px] text-muted-foreground">Tidak dapat memuat penggunaan.</p>
		{/if}
	</SettingsPanelBody>
</SettingsPanel>
