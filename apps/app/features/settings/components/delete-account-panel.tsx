"use client";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SettingsField,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "./settings-card";

export function DeleteAccountPanel({
  onDeleteAccount,
  pending,
}: {
  onDeleteAccount: () => void;
  pending: boolean;
}) {
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Hapus akun"
        description="Aqsha membersihkan data Convex yang dimiliki akun ini sebelum menghapus user Clerk."
      />
      <SettingsPanelBody>
        <SettingsField label="Ketik HAPUS untuk melanjutkan">
          <Input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
          />
        </SettingsField>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleteConfirmation !== "HAPUS" || pending}
          onClick={onDeleteAccount}
        >
          {pending ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
          Hapus akun permanen
        </Button>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}

