"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

const subscribeToMount = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function useIsMounted() {
  return useSyncExternalStore(subscribeToMount, clientSnapshot, serverSnapshot);
}

export function SettingsAppearancePage() {
  const { theme, resolvedTheme, setTheme } = useTheme();
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
                    setTheme(option.key);
                  }}
                  disabled={!mounted}
                  className={cn(
                    "flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-[12px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.98] disabled:cursor-default disabled:opacity-70",
                    active
                      ? "border border-border/40 bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-3.5",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {option.label}
                </button>
              );
            })}
          </div>
        </SettingsPanelBody>
        <SettingsPanelFooter>
          <p className="text-[12px] text-muted-foreground">
            Pilihan disimpan di browser ini dan tidak disinkronkan ke akun.
          </p>
        </SettingsPanelFooter>
      </SettingsPanel>
    </>
  );
}
