"use client";

import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { DisplayNamePanel } from "../components/display-name-field";
import { ProfileAvatarPicker } from "../components/profile-avatar-picker";
import {
  SettingsField,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  SettingsReadonlyValue,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

export function SettingsAccountPage() {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");
  if (!viewer) return <LoadingSettingsPage />;

  const name = viewer.name || "Pengguna Aqsha";
  const email = viewer.email || "Belum masuk";

  return (
    <>
      <SettingsHeader section="account" />

      <SettingsPanel>
        <SettingsPanelHeader
          title="Profil"
          description="Informasi yang ditampilkan di sidebar dan menu pengguna."
        />
        <SettingsPanelBody>
          <div className="flex items-center gap-4">
            <ProfileAvatarPicker name={name} email={email} image={viewer.image} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{name}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{email}</p>
            </div>
          </div>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Email kamu" />
        <SettingsPanelBody>
          <SettingsField label="Alamat email">
            <SettingsReadonlyValue value={viewer.email ?? "Belum diisi"} />
          </SettingsField>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Detail akun"
          description="Identitas disimpan oleh penyedia autentikasi."
        />
        <DisplayNamePanel savedName={viewer.name} />
      </SettingsPanel>
    </>
  );
}
