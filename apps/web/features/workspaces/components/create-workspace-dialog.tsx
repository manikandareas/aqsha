"use client";

import { useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { PlusIcon } from "@aqsha/ui/icons";
import { useCreateWorkspace } from "../api";
import { NameDialog } from "./common-dialogs";

/** Tombol + dialog buat workspace. Cap plan di-surface via toast error (403). */
export function CreateWorkspaceButton() {
  const [open, setOpen] = useState(false);
  const create = useCreateWorkspace();

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <PlusIcon />
        Buat workspace
      </Button>
      <NameDialog
        open={open}
        onOpenChange={setOpen}
        title="Buat workspace"
        description="Workspace mewadahi riset, dokumen, dan folder kamu."
        label="Nama workspace"
        submitLabel="Buat"
        pending={create.isPending}
        onSubmit={(name) =>
          create.mutate(
            { name },
            { onSuccess: () => setOpen(false) },
          )
        }
      />
    </>
  );
}
