"use client";

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

export function SettingsAppearancePage() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const options = [
    { key: "light", label: "Light", icon: SunIcon },
    { key: "dark", label: "Dark", icon: MoonIcon },
    { key: "system", label: "System", icon: MonitorIcon },
  ];

  return (
    <>
      <SettingsHeader section="appearance" />
      <div className="grid gap-3">
        <SettingsSectionLabel>Appearance</SettingsSectionLabel>
        <SettingsCard>
          <SettingRow label="Theme" description={`Resolved sekarang: ${resolvedTheme ?? "system"}`}>
            <div className="grid min-w-[280px] grid-cols-3 gap-1.5 rounded-xl border border-border/50 bg-muted/65 p-1.5">
              {options.map((option) => {
                const Icon = option.icon;
                const active = (theme ?? "system") === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTheme(option.key)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-[8px] px-2.5 py-2 text-[12px] font-semibold tracking-tight active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out cursor-pointer",
                      active
                        ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-border/20 font-bold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("size-3.5 transition-colors duration-150", active ? "text-primary" : "text-muted-foreground")} />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </SettingRow>
        </SettingsCard>
      </div>
    </>
  );
}
