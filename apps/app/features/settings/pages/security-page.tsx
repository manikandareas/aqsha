"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useSettingsSecurityData } from "../api/use-settings-security-data";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { ReadonlyField, SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

export function SettingsSecurityPage() {
  const router = useRouter();
  const { viewer } = useSettingsSecurityData();
  if (!viewer) return <LoadingSettingsPage />;

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  return (
    <>
      <SettingsHeader section="security" />
      <div className="grid gap-3">
        <SettingsSectionLabel>Session</SettingsSectionLabel>
        <SettingsCard>
          <ReadonlyField label="Email" value={viewer.email ?? "Not provided"} />
          <ReadonlyField label="Password reset" value="Unavailable in v1" />
          <ReadonlyField label="Active sessions" value="Unavailable in v1" />
          <ReadonlyField label="Account deletion" value="Unavailable in v1" />
          <SettingRow label="Sign out" description="Keluar dari perangkat ini.">
            <Button
              type="button"
              variant="destructive"
              onClick={signOut}
              className="rounded-[8px] active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out cursor-pointer flex items-center gap-1.5 font-semibold"
            >
              <LogOutIcon className="size-4" />
              Sign out
            </Button>
          </SettingRow>
        </SettingsCard>
      </div>
    </>
  );
}
