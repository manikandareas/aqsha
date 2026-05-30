"use client";

import { useState } from "react";
import { Loader2Icon, SaveIcon } from "lucide-react";
import { api } from "@aqsha/convex/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { readableConvexErrorMessage } from "@/lib/convex-error";
import { useConvexMutationState } from "@/lib/convex-query";
import { useDraftField } from "../lib/use-draft-field";
import {
  SettingsField,
  SettingsPanelBody,
  SettingsPanelFooter,
} from "./settings-card";

export function useDisplayNameEditor(savedName: string | null) {
  const updateDisplayName = useConvexMutationState(api.auth.updateDisplayName);
  const { saved, draft, setDraft } = useDraftField(savedName);
  const [localError, setLocalError] = useState<string | null>(null);

  const trimmedDraft = draft.trim();
  const isDirty = trimmedDraft !== saved;
  const saving = updateDisplayName.isPending;
  const error = localError ?? (updateDisplayName.error
    ? readableConvexErrorMessage(
        updateDisplayName.error,
        "Gagal menyimpan nama tampilan.",
      )
    : null);
  const canSave = isDirty && trimmedDraft.length > 0 && !saving;

  const save = async () => {
    if (!canSave) return;

    setLocalError(null);
    updateDisplayName.reset();
    try {
      await updateDisplayName.mutateAsync({ name: trimmedDraft });
    } catch (saveError) {
      setLocalError(
        readableConvexErrorMessage(saveError, "Gagal menyimpan nama tampilan."),
      );
    }
  };

  return {
    draft,
    setDraft,
    saving,
    error,
    setError: setLocalError,
    isDirty,
    canSave,
    save,
  };
}

type DisplayNameEditor = ReturnType<typeof useDisplayNameEditor>;

function DisplayNameInput({ editor }: { editor: DisplayNameEditor }) {
  const { draft, setDraft, setError, saving, error, save } = editor;

  return (
    <div className="grid gap-2">
      <Input
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void save();
          }
        }}
        disabled={saving}
        placeholder="Nama tampilan"
        autoComplete="name"
        className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
      />

      {error ? <p className="text-[12px] text-coral-foreground">{error}</p> : null}
    </div>
  );
}

function DisplayNameSaveButton({ editor }: { editor: DisplayNameEditor }) {
  const { canSave, saving, save } = editor;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={!canSave}
      onClick={() => void save()}
      aria-label="Simpan nama tampilan"
    >
      {saving ? (
        <Loader2Icon className="size-3.5 animate-spin text-primary" />
      ) : (
        <SaveIcon className="size-3.5 text-primary" />
      )}
      Simpan
    </Button>
  );
}

export function DisplayNamePanel({ savedName }: { savedName: string | null }) {
  const editor = useDisplayNameEditor(savedName);

  return (
    <>
      <SettingsPanelBody className="grid gap-5">
        <SettingsField label="nama tampilan">
          <DisplayNameInput editor={editor} />
        </SettingsField>
      </SettingsPanelBody>

      <SettingsPanelFooter>
        <DisplayNameSaveButton editor={editor} />
      </SettingsPanelFooter>
    </>
  );
}
