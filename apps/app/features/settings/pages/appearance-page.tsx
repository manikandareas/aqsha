"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  useAccountThemePreference,
  useIsMounted,
} from "@/lib/account-theme";
import { cn } from "@/lib/utils";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

export function SettingsAppearancePage() {
  const { theme, resolvedTheme, savingTheme, themeError, setThemePreference } =
    useAccountThemePreference();
  const mounted = useIsMounted();

  const options = [
    { key: "light", label: "Terang", icon: SunIcon },
    { key: "dark", label: "Gelap", icon: MoonIcon },
    { key: "system", label: "Sistem", icon: MonitorIcon },
  ] as const;
  const activeTheme = mounted ? theme ?? "system" : "system";

  return (
    <>
      <SettingsHeader section="appearance" />

      <SettingsPanel>
        <SettingsPanelHeader
          title="Tema"
          description={`Tema aktif sekarang: ${mounted ? resolvedTheme ?? "sistem" : "memuat"}.`}
        />
        <SettingsPanelBody>
          <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-border/60 bg-muted/50 p-1.5">
            {options.map((option) => {
              const Icon = option.icon;
              const active = activeTheme === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    void setThemePreference(option.key);
                  }}
                  disabled={!mounted || savingTheme}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-wait disabled:opacity-70",
                    active
                      ? "border border-border/40 bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-3.5", active ? "text-primary" : "text-muted-foreground")} />
                  {option.label}
                </button>
              );
            })}
          </div>
          {themeError ? (
            <p className="mt-3 text-[12px] text-coral-foreground">{themeError}</p>
          ) : null}
        </SettingsPanelBody>
        <SettingsPanelFooter>
          <p className="text-[12px] text-muted-foreground">
            Pilihan disimpan ke akun dan disinkronkan ke perangkat lain setelah masuk.
          </p>
        </SettingsPanelFooter>
      </SettingsPanel>
    </>
  );
}
