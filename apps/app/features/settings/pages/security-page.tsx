"use client";

import { UserProfile } from "@clerk/nextjs";
import { useAccountDeletion } from "../api/use-account-deletion";
import { DeleteAccountPanel } from "../components/delete-account-panel";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";
import { useSettingsSecurityData } from "../api/use-settings-security-data";

export function SettingsSecurityPage() {
  const { viewer } = useSettingsSecurityData();
  const accountDeletion = useAccountDeletion();

  if (!viewer) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="security" />

      {accountDeletion.notice ? (
        <div className="rounded-[12px] border border-mint-soft-border bg-mint-soft px-4 py-3 text-sm font-medium leading-6 text-mint-foreground">
          {accountDeletion.notice}
        </div>
      ) : null}
      {accountDeletion.error ? (
        <div className="rounded-[12px] border border-coral-soft-border bg-coral-soft px-4 py-3 text-sm font-medium leading-6 text-coral-foreground">
          {accountDeletion.error}
        </div>
      ) : null}

      <SettingsPanel>
        <SettingsPanelHeader
          title="Keamanan akun"
          description="Email, kata sandi, provider sosial, MFA, dan sesi dikelola oleh Clerk."
        />
        <SettingsPanelBody>
          <UserProfile
            routing="hash"
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox: "w-full shadow-none border-none bg-transparent",
              },
            }}
          />
        </SettingsPanelBody>
      </SettingsPanel>

      <DeleteAccountPanel
        pending={accountDeletion.pending}
        onDeleteAccount={() => void accountDeletion.deleteAccount()}
      />
    </>
  );
}
