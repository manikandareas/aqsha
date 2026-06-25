"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { Loader2Icon, Trash2Icon } from "@aqsha/ui/icons";
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
import { useDeleteAccount, useProfile, useUpdateDisplayName } from "../api";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsRow,
} from "./settings-card";
import { SettingsHeader } from "./settings-header";

export function AccountPage() {
  const profile = useProfile();
  const update = useUpdateDisplayName();
  const del = useDeleteAccount();
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canDelete = confirm.trim() === "HAPUS";

  function onDeleteOpenChange(open: boolean) {
    setDeleteOpen(open);
    if (!open) setConfirm("");
  }

  // Inisialisasi field dari profil saat data tiba (render-phase, bukan effect).
  const value = name ?? profile.data?.name ?? "";
  const dirty = name !== null && name.trim() !== (profile.data?.name ?? "");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    update.mutate(trimmed);
  }

  return (
    <>
      <SettingsHeader section="account" title="Akun" description="Kelola profil dan identitas kamu." />

      <SettingsPanel>
        <SettingsPanelHeader title="Nama tampilan" description="Nama yang muncul di seluruh aplikasi." />
        <form onSubmit={onSubmit}>
          <SettingsPanelBody>
            <Input
              value={value}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              placeholder="Nama kamu"
              disabled={profile.isPending || update.isPending}
              className="max-w-md"
            />
          </SettingsPanelBody>
          <SettingsPanelFooter className="justify-end">
            <Button type="submit" size="sm" disabled={!dirty || !value.trim() || update.isPending}>
              {update.isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Simpan
            </Button>
          </SettingsPanelFooter>
        </form>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader title="Detail akun" description="Email dan foto profil kamu." />
        <div className="divide-y divide-border/60">
          <SettingsRow label="Email">
            <span className="text-muted-foreground">{profile.data?.email ?? "—"}</span>
          </SettingsRow>
          <SettingsRow label="Foto profil" description="Ubah di menu profil pojok aplikasi." />
        </div>
      </SettingsPanel>

      <SettingsPanel className="border-destructive/30">
        <SettingsPanelHeader
          title="Hapus akun"
          description="Menghapus permanen seluruh data kamu (workspace, artifact, chat, feed, billing). Tindakan ini tidak bisa dibatalkan."
          className="border-destructive/20"
        />
        <SettingsPanelFooter className="justify-end border-destructive/20 bg-destructive/[0.03]">
          <Dialog open={deleteOpen} onOpenChange={onDeleteOpenChange}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={del.isPending}>
                <Trash2Icon className="size-4" />
                Hapus akun saya
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Hapus akun permanen?</DialogTitle>
                <DialogDescription>
                  Menghapus seluruh data kamu (workspace, artifact, chat, feed, billing).
                  Tindakan ini tidak bisa dibatalkan.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <label htmlFor="confirm-delete" className="text-[13px] font-medium text-foreground">
                  Ketik <span className="font-semibold">HAPUS</span> untuk konfirmasi
                </label>
                <Input
                  id="confirm-delete"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="HAPUS"
                  autoFocus
                  disabled={del.isPending}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" size="sm" disabled={del.isPending}>
                    Batal
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!canDelete || del.isPending}
                  onClick={() => del.mutate()}
                >
                  {del.isPending ? <Loader2Icon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                  Hapus permanen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </SettingsPanelFooter>
      </SettingsPanel>
    </>
  );
}
