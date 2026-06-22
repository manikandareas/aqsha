"use client";

import { Button } from "@/components/ui/button";
import { SettingsPanelBody, SettingsPanelHeader } from "./settings-card";

/** Stub V2 — upload avatar belum tersedia di api-v2. */
export function ProfileAvatarPicker({
  name,
  email,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  return (
    <SettingsPanelBody>
      <div className="flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted text-lg font-semibold">
          {name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{email}</p>
        </div>
      </div>
      <SettingsPanelHeader
        title="Foto profil"
        description="Upload avatar akan hadir di pembaruan berikutnya."
      />
      <Button type="button" variant="outline" size="sm" disabled>
        Unggah foto (segera hadir)
      </Button>
    </SettingsPanelBody>
  );
}
