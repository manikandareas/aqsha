"use client";

import Link from "next/link";
import { ShieldCheckIcon } from "@aqsha/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDraftField } from "../lib/use-draft-field";
import {
  SettingsField,
  SettingsPanelBody,
  SettingsPanelFooter,
} from "./settings-card";

export function EmailChangePanel({ savedEmail }: { savedEmail: string | null }) {
  const { draft } = useDraftField(savedEmail);

  return (
    <>
      <SettingsPanelBody className="grid gap-5">
        <SettingsField
          label="Alamat email"
          description="Perubahan email dikonfirmasi lewat alamat email yang sedang aktif."
        >
          <div className="grid gap-2">
            <Input
              value={draft}
              disabled
              type="email"
              autoComplete="email"
              className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            />
            <p className="text-[12px] text-muted-foreground">
              Ubah email lewat halaman keamanan Clerk agar verifikasi dan sesi tetap konsisten.
            </p>
          </div>
        </SettingsField>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          asChild
          type="button"
          variant="secondary"
          size="sm"
        >
          <Link href="/app/settings/security">
            <ShieldCheckIcon className="size-3.5 text-primary" />
            Kelola di keamanan
          </Link>
        </Button>
      </SettingsPanelFooter>
    </>
  );
}
