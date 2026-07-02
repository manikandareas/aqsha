"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon } from "@aqsha/ui/icons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  INTEREST_OPTIONS,
  MIN_INTERESTS,
} from "@/features/onboarding/lib/onboarding-options";
import { cn } from "@/lib/utils";
import { usePreferences, useUpdateInterests, useUpdatePreferences } from "../api";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPill,
  SettingsRow,
  SettingsSegmentedControl,
} from "./settings-card";
import { SettingsHeader } from "./settings-header";

// Sentinel "default" untuk Radix Select (value="" tidak didukung) — dipetakan ke null saat submit.
const DEFAULT_VALUE = "default";

const LANGUAGE_OPTIONS = [
  { id: DEFAULT_VALUE, label: "Otomatis (ikuti bahasamu)" },
  { id: "id", label: "Bahasa Indonesia" },
  { id: "en", label: "English" },
];

const CITATION_OPTIONS = [
  { id: DEFAULT_VALUE, label: "Default (APA 7 bila diminta)" },
  { id: "apa7", label: "APA edisi 7" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" },
  { id: "ieee", label: "IEEE" },
  { id: "vancouver", label: "Vancouver" },
  { id: "harvard", label: "Harvard" },
];

const STYLE_OPTIONS = [
  { id: DEFAULT_VALUE, label: "Default", hint: "Menyesuaikan bentuk pertanyaanmu." },
  { id: "ringkas", label: "Ringkas", hint: "Langsung ke inti jawaban." },
  { id: "seimbang", label: "Seimbang", hint: "Inti jawaban plus penjelasan secukupnya." },
  { id: "lengkap", label: "Lengkap", hint: "Uraian menyeluruh dengan konteks." },
];

const CUSTOM_MAX = 500;

function PreferenceSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="w-56 max-w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PersonalizationPage() {
  const prefs = usePreferences();
  const updatePrefs = useUpdatePreferences();
  const updateInterests = useUpdateInterests();

  // Draft null = belum disentuh → tampilkan nilai server (pola account-page).
  const [language, setLanguage] = useState<string | null>(null);
  const [citation, setCitation] = useState<string | null>(null);
  const [style, setStyle] = useState<string | null>(null);
  const [custom, setCustom] = useState<string | null>(null);
  const [interests, setInterests] = useState<string[] | null>(null);

  const serverLanguage = prefs.data?.answerLanguage ?? DEFAULT_VALUE;
  const serverCitation = prefs.data?.citationStyle ?? DEFAULT_VALUE;
  const serverStyle = prefs.data?.responseStyle ?? DEFAULT_VALUE;
  const serverCustom = prefs.data?.customInstruction ?? "";
  const serverInterests = prefs.data?.interests ?? [];

  const languageValue = language ?? serverLanguage;
  const citationValue = citation ?? serverCitation;
  const styleValue = style ?? serverStyle;
  const customValue = custom ?? serverCustom;
  const interestsValue = interests ?? serverInterests;

  const activeStyle =
    STYLE_OPTIONS.find((o) => o.id === styleValue) ?? STYLE_OPTIONS[0];

  const prefsDirty =
    languageValue !== serverLanguage ||
    citationValue !== serverCitation ||
    styleValue !== serverStyle ||
    customValue.trim() !== serverCustom;
  const interestsDirty =
    interests !== null &&
    (interests.length !== serverInterests.length ||
      interests.some((id) => !serverInterests.includes(id)));

  function onSubmitPrefs(e: FormEvent) {
    e.preventDefault();
    updatePrefs.mutate(
      {
        answerLanguage: languageValue === DEFAULT_VALUE ? null : languageValue,
        citationStyle: citationValue === DEFAULT_VALUE ? null : citationValue,
        responseStyle: styleValue === DEFAULT_VALUE ? null : styleValue,
        customInstruction: customValue.trim() || null,
      },
      {
        onSuccess: () => {
          setLanguage(null);
          setCitation(null);
          setStyle(null);
          setCustom(null);
        },
      },
    );
  }

  function toggleInterest(id: string) {
    const current = interestsValue;
    setInterests(
      current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
    );
  }

  function onSubmitInterests(e: FormEvent) {
    e.preventDefault();
    updateInterests.mutate(interestsValue, { onSuccess: () => setInterests(null) });
  }

  const busy = prefs.isPending;
  const prefsLocked = busy || updatePrefs.isPending;

  return (
    <>
      <SettingsHeader section="personalization" />

      <SettingsPanel>
        <SettingsPanelHeader
          title="Preferensi Astra"
          description="Berlaku di semua percakapan sebagai default. Permintaan berbeda di dalam percakapan tetap menang."
        />
        <form onSubmit={onSubmitPrefs}>
          <div className="divide-y divide-border/60">
            <SettingsRow label="Bahasa jawaban">
              <PreferenceSelect
                value={languageValue}
                onChange={setLanguage}
                options={LANGUAGE_OPTIONS}
                disabled={prefsLocked}
              />
            </SettingsRow>
            <SettingsRow
              label="Gaya sitasi"
              description="Dipakai saat menyusun daftar pustaka."
            >
              <PreferenceSelect
                value={citationValue}
                onChange={setCitation}
                options={CITATION_OPTIONS}
                disabled={prefsLocked}
              />
            </SettingsRow>
            <SettingsRow label="Gaya jawaban" description={activeStyle.hint}>
              <SettingsSegmentedControl>
                {STYLE_OPTIONS.map((option) => {
                  const active = styleValue === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setStyle(option.id)}
                      disabled={prefsLocked}
                      className={cn(
                        "cursor-pointer rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-default disabled:opacity-70",
                        active
                          ? "border border-border/40 bg-card text-foreground"
                          : "border border-transparent text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </SettingsSegmentedControl>
            </SettingsRow>
            <SettingsPanelBody className="grid gap-2">
              <div className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-foreground">Instruksi kustom</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                    Catatan menetap untuk Astra, mis. bidang studimu atau format yang kamu sukai.
                  </p>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                  {customValue.length}/{CUSTOM_MAX}
                </span>
              </div>
              <Textarea
                value={customValue}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={CUSTOM_MAX}
                rows={4}
                placeholder="Contoh: Saya mahasiswa S1 pendidikan matematika; gunakan istilah metodologi berbahasa Indonesia."
                disabled={prefsLocked}
              />
            </SettingsPanelBody>
          </div>
          <SettingsPanelFooter className="justify-between">
            <p className="text-[12px] text-muted-foreground">
              {prefsDirty ? "Ada perubahan yang belum disimpan." : ""}
            </p>
            <Button type="submit" size="sm" disabled={!prefsDirty || updatePrefs.isPending}>
              {updatePrefs.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Simpan preferensi
            </Button>
          </SettingsPanelFooter>
        </form>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Minat riset"
          description="Bidang yang kamu pilih saat onboarding — dipakai untuk personalisasi feed."
          action={
            <SettingsPill className="tabular-nums">
              {interestsValue.length} terpilih
            </SettingsPill>
          }
        />
        <form onSubmit={onSubmitInterests}>
          <SettingsPanelBody>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((option) => {
                const active = interestsValue.includes(option.id);
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggleInterest(option.id)}
                    aria-pressed={active}
                    disabled={busy || updateInterests.isPending}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out active:scale-[0.97] disabled:cursor-default disabled:opacity-70",
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/60 bg-transparent text-muted-foreground hover:border-border hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </SettingsPanelBody>
          <SettingsPanelFooter className="justify-between">
            <p className="text-[12px] text-muted-foreground">
              {interestsValue.length < MIN_INTERESTS
                ? `Pilih minimal ${MIN_INTERESTS} bidang.`
                : ""}
            </p>
            <Button
              type="submit"
              size="sm"
              disabled={
                !interestsDirty || interestsValue.length < MIN_INTERESTS || updateInterests.isPending
              }
            >
              {updateInterests.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Simpan minat
            </Button>
          </SettingsPanelFooter>
        </form>
      </SettingsPanel>
    </>
  );
}
