"use client";

import { useSecuritySettingsController } from "../api/use-security-settings-controller";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  SecurityAuthenticationPanel,
  SecurityDeleteAccountPanel,
  SecurityPasswordPanel,
  SecuritySessionsPanel,
} from "../components/security-panels";
import { SettingsHeader } from "../components/settings-header";

export function SettingsSecurityPage() {
  const controller = useSecuritySettingsController();
  if (!controller.viewer || !controller.capabilities) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="security" />

      {controller.notice ? (
        <div className="rounded-[12px] border border-mint-soft-border bg-mint-soft px-4 py-3 text-sm font-medium leading-6 text-mint-foreground">
          {controller.notice}
        </div>
      ) : null}
      {controller.error ? (
        <div className="rounded-[12px] border border-coral-soft-border bg-coral-soft px-4 py-3 text-sm font-medium leading-6 text-coral-foreground">
          {controller.error}
        </div>
      ) : null}

      <SecurityAuthenticationPanel controller={controller} />
      <SecurityPasswordPanel controller={controller} />
      <SecuritySessionsPanel controller={controller} />
      <SecurityDeleteAccountPanel controller={controller} />
    </>
  );
}
