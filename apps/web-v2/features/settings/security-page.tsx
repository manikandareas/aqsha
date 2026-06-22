"use client";

import { UserProfile } from "@clerk/nextjs";
import { DeleteAccountPanel } from "./components/delete-account-panel";
import { LoadingSettingsPage } from "./components/loading-settings-page";
import { SettingsPanel, SettingsPanelBody, SettingsPanelHeader } from "./components/settings-card";
import { SettingsHeader } from "./components/settings-header";
import { useAccountDeletion } from "./api/use-account-deletion";
import { useSettingsSecurityData } from "./api/use-settings-data";

export function SecurityPage() {
  const { profile } = useSettingsSecurityData();
  const accountDeletion = useAccountDeletion();

  if (!profile) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="security" />
      <SettingsPanel>
        <SettingsPanelHeader
          title="Keamanan akun"
          description="Email, kata sandi, provider sosial, MFA, dan sesi dikelola oleh Clerk."
        />
        <SettingsPanelBody>
          <UserProfile routing="hash" />
        </SettingsPanelBody>
      </SettingsPanel>
      <DeleteAccountPanel onDeleteAccount={() => undefined} pending={false} />
    </>
  );
}
