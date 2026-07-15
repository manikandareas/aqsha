<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Icon, Loader2Icon } from '$lib/icons';
	import { INTEREST_OPTIONS, MIN_INTERESTS } from '$lib/features/onboarding/lib/onboarding-options';
	import { cn } from '$lib/utils';
	import { usePreferences, useUpdateInterests, useUpdatePreferences } from '../api';
	import PreferenceSelect from './PreferenceSelect.svelte';
	import SettingsHeader from '../components/SettingsHeader.svelte';
	import {
		SettingsPanel,
		SettingsPanelBody,
		SettingsPanelFooter,
		SettingsPanelHeader,
		SettingsPill,
		SettingsRow,
		SettingsSegmentedControl
	} from '../components/settings-card';

	// Sentinel "default" for the Select (value="" unsupported) — mapped to null on submit.
	const DEFAULT_VALUE = 'default';

	const LANGUAGE_OPTIONS = [
		{ id: DEFAULT_VALUE, label: 'Otomatis (ikuti bahasamu)' },
		{ id: 'id', label: 'Bahasa Indonesia' },
		{ id: 'en', label: 'English' }
	];
	const CITATION_OPTIONS = [
		{ id: DEFAULT_VALUE, label: 'Default (APA 7 bila diminta)' },
		{ id: 'apa7', label: 'APA edisi 7' },
		{ id: 'mla', label: 'MLA' },
		{ id: 'chicago', label: 'Chicago' },
		{ id: 'ieee', label: 'IEEE' },
		{ id: 'vancouver', label: 'Vancouver' },
		{ id: 'harvard', label: 'Harvard' }
	];
	const STYLE_OPTIONS = [
		{ id: DEFAULT_VALUE, label: 'Default', hint: 'Menyesuaikan bentuk pertanyaanmu.' },
		{ id: 'ringkas', label: 'Ringkas', hint: 'Langsung ke inti jawaban.' },
		{ id: 'seimbang', label: 'Seimbang', hint: 'Inti jawaban plus penjelasan secukupnya.' },
		{ id: 'lengkap', label: 'Lengkap', hint: 'Uraian menyeluruh dengan konteks.' }
	];
	const CUSTOM_MAX = 500;

	const prefs = usePreferences();
	const updatePrefs = useUpdatePreferences();
	const updateInterests = useUpdateInterests();

	// Draft null = untouched → show the server value.
	let language = $state<string | null>(null);
	let citation = $state<string | null>(null);
	let style = $state<string | null>(null);
	let custom = $state<string | null>(null);
	let interests = $state<string[] | null>(null);

	const serverLanguage = $derived(prefs.data?.answerLanguage ?? DEFAULT_VALUE);
	const serverCitation = $derived(prefs.data?.citationStyle ?? DEFAULT_VALUE);
	const serverStyle = $derived(prefs.data?.responseStyle ?? DEFAULT_VALUE);
	const serverCustom = $derived(prefs.data?.customInstruction ?? '');
	const serverInterests = $derived(prefs.data?.interests ?? []);

	const languageValue = $derived(language ?? serverLanguage);
	const citationValue = $derived(citation ?? serverCitation);
	const styleValue = $derived(style ?? serverStyle);
	const customValue = $derived(custom ?? serverCustom);
	const interestsValue = $derived(interests ?? serverInterests);

	const activeStyle = $derived(STYLE_OPTIONS.find((o) => o.id === styleValue) ?? STYLE_OPTIONS[0]);

	const prefsDirty = $derived(
		languageValue !== serverLanguage ||
			citationValue !== serverCitation ||
			styleValue !== serverStyle ||
			customValue.trim() !== serverCustom
	);
	const interestsDirty = $derived(
		interests !== null &&
			(interests.length !== serverInterests.length ||
				interests.some((id) => !serverInterests.includes(id)))
	);

	const busy = $derived(prefs.isPending);
	const prefsLocked = $derived(busy || updatePrefs.isPending);

	function onSubmitPrefs(event: SubmitEvent) {
		event.preventDefault();
		updatePrefs.mutate(
			{
				answerLanguage: languageValue === DEFAULT_VALUE ? null : languageValue,
				citationStyle: citationValue === DEFAULT_VALUE ? null : citationValue,
				responseStyle: styleValue === DEFAULT_VALUE ? null : styleValue,
				customInstruction: customValue.trim() || null
			},
			{
				onSuccess: () => {
					language = null;
					citation = null;
					style = null;
					custom = null;
				}
			}
		);
	}

	function toggleInterest(id: string) {
		const current = interestsValue;
		interests = current.includes(id) ? current.filter((v) => v !== id) : [...current, id];
	}

	function onSubmitInterests(event: SubmitEvent) {
		event.preventDefault();
		updateInterests.mutate(interestsValue, { onSuccess: () => (interests = null) });
	}
</script>

<SettingsHeader section="personalization" />

<SettingsPanel>
	<SettingsPanelHeader
		title="Preferensi Astra"
		description="Berlaku di semua percakapan sebagai default. Permintaan berbeda di dalam percakapan tetap menang."
	/>
	<form onsubmit={onSubmitPrefs}>
		<div class="divide-y divide-border/60">
			<SettingsRow label="Bahasa jawaban">
				<PreferenceSelect
					value={languageValue}
					onValueChange={(v) => (language = v)}
					options={LANGUAGE_OPTIONS}
					disabled={prefsLocked}
				/>
			</SettingsRow>
			<SettingsRow label="Gaya sitasi" description="Dipakai saat menyusun daftar pustaka.">
				<PreferenceSelect
					value={citationValue}
					onValueChange={(v) => (citation = v)}
					options={CITATION_OPTIONS}
					disabled={prefsLocked}
				/>
			</SettingsRow>
			<SettingsRow
				label="Gaya jawaban"
				description={activeStyle.hint}
				descriptionClass="min-h-[2.5rem]"
			>
				<SettingsSegmentedControl>
					{#each STYLE_OPTIONS as option (option.id)}
						{@const active = styleValue === option.id}
						<button
							type="button"
							onclick={() => (style = option.id)}
							disabled={prefsLocked}
							class={cn(
								'cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-default disabled:opacity-70',
								active
									? 'border border-border/40 bg-card text-foreground'
									: 'border border-transparent text-muted-foreground hover:text-foreground'
							)}
						>
							{option.label}
						</button>
					{/each}
				</SettingsSegmentedControl>
			</SettingsRow>
			<SettingsPanelBody class="grid gap-2">
				<div class="flex items-baseline justify-between gap-4">
					<div class="min-w-0">
						<p class="text-[13px] font-medium text-foreground">Instruksi kustom</p>
						<p class="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
							Catatan menetap untuk Astra, mis. bidang studimu atau format yang kamu sukai.
						</p>
					</div>
					<span class="shrink-0 text-[11px] tabular-nums text-muted-foreground">
						{customValue.length}/{CUSTOM_MAX}
					</span>
				</div>
				<Textarea
					value={customValue}
					oninput={(event) => (custom = (event.currentTarget as HTMLTextAreaElement).value)}
					maxlength={CUSTOM_MAX}
					rows={4}
					placeholder="Contoh: Saya mahasiswa S1 pendidikan matematika; gunakan istilah metodologi berbahasa Indonesia."
					disabled={prefsLocked}
				/>
			</SettingsPanelBody>
		</div>
		<SettingsPanelFooter class="justify-between">
			<p class="text-[12px] text-muted-foreground">
				{prefsDirty ? 'Ada perubahan yang belum disimpan.' : ''}
			</p>
			<Button type="submit" size="sm" disabled={!prefsDirty || updatePrefs.isPending}>
				{#if updatePrefs.isPending}
					<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				{/if}
				Simpan preferensi
			</Button>
		</SettingsPanelFooter>
	</form>
</SettingsPanel>

<SettingsPanel>
	<SettingsPanelHeader
		title="Minat riset"
		description="Bidang yang kamu pilih saat onboarding — dipakai untuk personalisasi feed."
	>
		{#snippet action()}
			<SettingsPill class="tabular-nums">{interestsValue.length} terpilih</SettingsPill>
		{/snippet}
	</SettingsPanelHeader>
	<form onsubmit={onSubmitInterests}>
		<SettingsPanelBody>
			<div class="flex flex-wrap gap-2">
				{#each INTEREST_OPTIONS as option (option.id)}
					{@const active = interestsValue.includes(option.id)}
					<button
						type="button"
						onclick={() => toggleInterest(option.id)}
						aria-pressed={active}
						disabled={busy || updateInterests.isPending}
						class={cn(
							'cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-default disabled:opacity-70',
							active
								? 'border-primary bg-primary/10 text-primary'
								: 'border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground'
						)}
					>
						{option.label}
					</button>
				{/each}
			</div>
		</SettingsPanelBody>
		<SettingsPanelFooter class="justify-between">
			<p class="text-[12px] text-muted-foreground">
				{interestsValue.length < MIN_INTERESTS ? `Pilih minimal ${MIN_INTERESTS} bidang.` : ''}
			</p>
			<Button
				type="submit"
				size="sm"
				disabled={!interestsDirty ||
					interestsValue.length < MIN_INTERESTS ||
					updateInterests.isPending}
			>
				{#if updateInterests.isPending}
					<Icon icon={Loader2Icon} class="size-4 animate-spin" />
				{/if}
				Simpan minat
			</Button>
		</SettingsPanelFooter>
	</form>
</SettingsPanel>
