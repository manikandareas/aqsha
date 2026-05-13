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
      <div className="grid gap-4">
        <SettingsSectionLabel>Appearance</SettingsSectionLabel>
        <SettingsCard>
          <SettingRow label="Theme" description={`Resolved sekarang: ${resolvedTheme ?? "system"}`}>
            <div className="grid min-w-[260px] grid-cols-3 gap-1 rounded-[10px] border border-border bg-muted p-1">
              {options.map((option) => {
                const Icon = option.icon;
                const active = (theme ?? "system") === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setTheme(option.key)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors",
                      active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5" />
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
