<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon, MonitorIcon, MoonIcon, SunIcon } from '$lib/icons';
	import { themeContext, type ThemeMode } from '$lib/theme';
	import { cn } from '$lib/utils';
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import {
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsSegmentedControl
	} from '../components/settings-card';

	/**
	 * Theme preference control via the `$lib/theme` seam: `preference`, `mode`, `setMode`. The `mounted`
	 * guard avoids a hydration flash — before hydration the control reads "system"/"memuat"; after mount
	 * it reflects the browser-local preference.
	 */
	const theme = themeContext.get();
	const themeOptions: Array<{ key: ThemeMode; label: string; icon: typeof SunIcon }> = [
		{ key: 'light', label: 'Terang', icon: SunIcon },
		{ key: 'dark', label: 'Gelap', icon: MoonIcon },
		{ key: 'system', label: 'Sistem', icon: MonitorIcon }
	];

	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const activeTheme = $derived(mounted ? (theme.preference ?? 'system') : 'system');
	const resolvedLabel = $derived(mounted ? (theme.mode ?? 'sistem') : 'memuat');
</script>

<SettingsHeader section="appearance" />

<SettingsPanel>
	<SettingsPanelHeader title="Tema" description={`Tema aktif sekarang: ${resolvedLabel}.`} />
	<SettingsPanelBody>
		<SettingsSegmentedControl class="grid grid-cols-3">
			{#each themeOptions as option (option.key)}
				{@const active = activeTheme === option.key}
				<button
					type="button"
					onclick={() => theme.setMode(option.key)}
					disabled={!mounted}
					class={cn(
						// Border reserved on both states (color-only swap) so the active segment can't widen.
						'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-2.5 text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-default disabled:opacity-70',
						active
							? 'border-border/40 bg-card text-foreground'
							: 'border-transparent text-muted-foreground hover:text-foreground'
					)}
				>
					<Icon
						icon={option.icon}
						class={cn('size-3.5', active ? 'text-primary' : 'text-muted-foreground')}
					/>
					{option.label}
				</button>
			{/each}
		</SettingsSegmentedControl>
	</SettingsPanelBody>
	<SettingsPanelFooter>
		<p class="text-[12px] text-muted-foreground">
			Pilihan disimpan di browser ini dan tidak disinkronkan ke akun.
		</p>
	</SettingsPanelFooter>
</SettingsPanel>
