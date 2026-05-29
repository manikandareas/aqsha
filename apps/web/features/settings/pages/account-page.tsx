"use client";

import { LoadingSettingsPage } from "../components/loading-settings-page";
import { DisplayNamePanel } from "../components/display-name-field";
import { EmailChangePanel } from "../components/email-change-field";
import { ProfileAvatarPicker } from "../components/profile-avatar-picker";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";
import { useSettingsAccountData } from "../api/use-settings-account-data";

export function SettingsAccountPage() {
  const { viewer, isLoading } = useSettingsAccountData();
  if (isLoading || !viewer) return <LoadingSettingsPage />;

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
              <p className="mt-1 text-[11px] font-medium text-muted-foreground">
                {viewer.emailVerified ? "Email terverifikasi" : "Email belum terverifikasi"}
              </p>
            </div>
          </div>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Email kamu"
          description="Alamat email dipakai untuk masuk, reset kata sandi, billing, dan verifikasi keamanan."
        />
        <EmailChangePanel savedEmail={viewer.email} />
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
