"use client";

import { SettingsHeader } from "./components/settings-header";
import { ActiveDevicesPanel } from "./security/active-devices-panel";
import { PasswordPanel } from "./security/password-panel";
// Sementara dinonaktifkan — uncomment untuk mengaktifkan lagi (file panel tetap ada).
// import { TwoFactorPanel } from "./security/two-factor-panel";

export function SecurityPage() {
  return (
    <>
      <SettingsHeader section="security" />
      <PasswordPanel />
      {/* <TwoFactorPanel /> */}
      <ActiveDevicesPanel />
    </>
  );
}
