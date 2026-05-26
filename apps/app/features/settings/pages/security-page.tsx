"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon, MailIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useSettingsSecurityData } from "../api/use-settings-security-data";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  SettingsField,
  SettingsListItem,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsReadonlyValue,
} from "../components/settings-card";
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

      <SettingsPanel>
        <SettingsPanelHeader
          title="Autentikasi"
          description="Hubungkan akun ke penyedia masuk pihak ketiga."
        />
        <SettingsPanelBody>
          <SettingsListItem
            icon={MailIcon}
            title="Email & kata sandi"
            subtitle={viewer.email ?? "Belum diisi"}
            trailing={
              <span className="text-[11px] text-muted-foreground">Terhubung</span>
            }
          />
        </SettingsPanelBody>
        <SettingsPanelFooter>
          <p className="text-[12px] text-muted-foreground">
            Penyedia tambahan (GitHub, Google) belum tersedia di versi ini.
          </p>
        </SettingsPanelFooter>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Sesi" description="Kelola sesi dan akses di perangkat ini." />
        <SettingsPanelBody className="grid gap-5">
          <SettingsField label="Email masuk">
            <SettingsReadonlyValue value={viewer.email ?? "Belum diisi"} />
          </SettingsField>
          <SettingsField label="Reset kata sandi">
            <SettingsReadonlyValue value="Belum tersedia di v1" />
          </SettingsField>
          <SettingsField label="Sesi aktif">
            <SettingsReadonlyValue value="Belum tersedia di v1" />
          </SettingsField>
          <SettingsField label="Hapus akun">
            <SettingsReadonlyValue value="Belum tersedia di v1" />
          </SettingsField>
        </SettingsPanelBody>
        <SettingsPanelFooter>
          <Button
            type="button"
            variant="destructive"
            onClick={signOut}
            className="h-9 rounded-lg px-4 text-[13px] font-medium"
          >
            <LogOutIcon className="size-3.5" />
            Keluar
          </Button>
        </SettingsPanelFooter>
      </SettingsPanel>
    </>
  );
}
