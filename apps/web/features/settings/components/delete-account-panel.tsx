"use client";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [open, setOpen] = useState(false);
  const confirmed = deleteConfirmation === "HAPUS";

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setDeleteConfirmation("");
  }

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Hapus akun"
        description="Aqsha membersihkan data Convex yang dimiliki akun ini sebelum menghapus user Clerk."
      />
      <SettingsPanelBody>
        <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Tindakan ini permanen. Semua data akun yang terkait akan dibersihkan sebelum akun dihapus.
        </p>
      </SettingsPanelBody>
      <SettingsPanelFooter className="justify-end">
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={pending}
              className="transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.98]"
            >
              <Trash2Icon className="size-3.5" />
              Hapus akun
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Hapus akun permanen?</DialogTitle>
              <DialogDescription>
                Tindakan ini tidak bisa dibatalkan. Ketik HAPUS untuk mengonfirmasi penghapusan akun.
              </DialogDescription>
            </DialogHeader>

            <SettingsField label="Ketik HAPUS untuk melanjutkan">
              <Input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
                autoFocus
              />
            </SettingsField>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  Batal
                </Button>
              </DialogClose>
              <Button
                type="button"
                variant="destructive"
                disabled={!confirmed || pending}
                onClick={onDeleteAccount}
              >
                {pending ? (
                  <Loader2Icon className="size-3.5 animate-spin" />
                ) : (
                  <Trash2Icon className="size-3.5" />
                )}
                Hapus permanen
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}
