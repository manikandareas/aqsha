"use client";

import { Button } from "@aqsha/ui/components/button";
import { Loader2Icon, LogOutIcon } from "@aqsha/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevokeSession, useSessions } from "../api";
import {
  SettingsPanel,
  SettingsPanelHeader,
  SettingsPill,
  SettingsRow,
} from "../components/settings-card";

const rtf = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

function relativeTime(ms: number): string {
  const diff = ms - Date.now();
  for (const [unit, size] of UNITS) {
    if (Math.abs(diff) >= size) return rtf.format(Math.round(diff / size), unit);
  }
  return "baru saja";
}

export function ActiveDevicesPanel() {
  const sessions = useSessions();
  const revoke = useRevokeSession();

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Perangkat aktif"
        description="Perangkat yang sedang masuk ke akun kamu. Keluarkan perangkat yang tidak kamu kenali."
      />
      {sessions.isPending ? (
        <div className="divide-y divide-border/60">
          {[0, 1].map((i) => (
            <div key={i} className="px-5 py-4 sm:px-6">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-56" />
            </div>
          ))}
        </div>
      ) : sessions.isError ? (
        <div className="px-5 py-6 text-[13px] text-muted-foreground sm:px-6">
          Gagal memuat perangkat aktif.
        </div>
      ) : !sessions.data || sessions.data.length === 0 ? (
        <div className="px-5 py-6 text-[13px] text-muted-foreground sm:px-6">
          Tidak ada perangkat aktif.
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {sessions.data.map((s) => {
            const location = [s.city, s.country].filter(Boolean).join(", ");
            const meta = [location || s.ipAddress, `Terakhir aktif ${relativeTime(s.lastActiveAt)}`]
              .filter(Boolean)
              .join(" · ");
            const revoking = revoke.isPending && revoke.variables === s.id;
            return (
              <SettingsRow
                key={s.id}
                label={s.browser ?? s.device ?? "Perangkat tak dikenal"}
                description={meta}
              >
                {s.isCurrent ? (
                  <SettingsPill className="text-foreground">Perangkat ini</SettingsPill>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={revoking}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    {revoking ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : (
                      <LogOutIcon className="size-4" />
                    )}
                    Keluar
                  </Button>
                )}
              </SettingsRow>
            );
          })}
        </div>
      )}
    </SettingsPanel>
  );
}
