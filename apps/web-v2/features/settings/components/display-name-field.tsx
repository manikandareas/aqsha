"use client";

import { useState } from "react";
import { Loader2Icon, SaveIcon } from "@aqsha/ui/icons";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readableApiErrorMessage } from "@/lib/api-error";
import { useUpdateDisplayName } from "@/features/settings/api";
import { useDraftField } from "../lib/use-draft-field";
import { SettingsField, SettingsPanelBody, SettingsPanelFooter } from "./settings-card";

export function useDisplayNameEditor(savedName: string | null) {
  const updateDisplayName = useUpdateDisplayName();
  const { saved, draft, setDraft } = useDraftField(savedName);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmedDraft = draft.trim();
  const isDirty = trimmedDraft !== saved;
  const saving = updateDisplayName.isPending;
  const error =
    localError ??
    (updateDisplayName.error
      ? readableApiErrorMessage(updateDisplayName.error, "Gagal menyimpan nama tampilan.")
      : null);
  const canSave = isDirty && trimmedDraft.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;
    setLocalError(null);
    try {
      await updateDisplayName.mutateAsync(trimmedDraft);
      toast.success("Nama tampilan diperbarui.");
    } catch (submitError) {
      setLocalError(
        readableApiErrorMessage(submitError, "Gagal menyimpan nama tampilan."),
      );
    }
  };

  return { saved, draft, setDraft, saving, error, canSave, save };
}

export function DisplayNamePanel({ savedName }: { savedName: string | null }) {
  const editor = useDisplayNameEditor(savedName);

  return (
    <>
      <SettingsPanelBody>
        <SettingsField label="Nama tampilan" description="Ditampilkan di sidebar dan sapaan.">
          <Input
            value={editor.draft}
            onChange={(event) => editor.setDraft(event.target.value)}
            placeholder="Nama kamu"
            autoComplete="name"
          />
          {editor.error ? (
            <p className="text-[12px] text-destructive">{editor.error}</p>
          ) : null}
        </SettingsField>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button type="button" size="sm" disabled={!editor.canSave} onClick={() => void editor.save()}>
          {editor.saving ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Simpan
        </Button>
      </SettingsPanelFooter>
    </>
  );
}
