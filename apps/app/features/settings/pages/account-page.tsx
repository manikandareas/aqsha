"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "../lib/settings-format";
import { PlanChip, ReadonlyField, SettingRow, SettingsCard, SettingsSectionLabel } from "../components/settings-card";
import { LoadingSettingsPage, SettingsHeader, useSettingsData } from "./shared";

export function SettingsAccountPage() {
  const { viewer, current } = useSettingsData();
  if (!viewer || !current) return <LoadingSettingsPage />;

  const name = viewer.name || "Aqsha user";
  const email = viewer.email || "Signed in";

  return (
    <>
      <SettingsHeader section="account" />
      <div className="grid gap-4">
        <SettingsSectionLabel>Profile</SettingsSectionLabel>
        <SettingsCard>
          <SettingRow label="Avatar" description="Displayed in the Aqsha app sidebar.">
            <div className="flex items-center justify-start gap-3 sm:justify-end">
              <Avatar className="size-10 rounded-full ring-1 ring-[var(--sky-soft-border)]">
                {viewer.image ? <AvatarImage src={viewer.image} alt={name} /> : null}
                <AvatarFallback className="bg-[var(--sky-soft)] text-sm font-bold text-primary">
                  {getInitials(name, email)}
                </AvatarFallback>
              </Avatar>
              <PlanChip label={current.planLabel} status={current.status} />
            </div>
          </SettingRow>
          <ReadonlyField label="Email" value={viewer.email ?? "Not provided"} />
          <ReadonlyField label="Display name" value={viewer.name ?? "Not provided"} />
          <ReadonlyField label="User ID" value={viewer.id} />
          <ReadonlyField label="Image" value={viewer.image ?? "Not provided"} />
        </SettingsCard>
      </div>
    </>
  );
}
