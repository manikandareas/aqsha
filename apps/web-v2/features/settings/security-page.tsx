"use client";

import { UserProfile } from "@clerk/nextjs";
import { SettingsHeader } from "./components/settings-header";

export function SecurityPage() {
  return (
    <>
      <SettingsHeader section="security" />
      <UserProfile routing="hash" />
    </>
  );
}
