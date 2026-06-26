"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { type FormEvent, useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { Loader2Icon } from "@aqsha/ui/icons";
import { toast } from "sonner";
import {
  SettingsField,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "../components/settings-card";
import { clerkErrorMessage } from "./clerk-error";

/**
 * Ganti/atur kata sandi via Clerk frontend SDK (langsung browser→Clerk, tak lewat
 * server kita). Aksi sensitif → `useReverification` (Clerk munculkan modal verifikasi
 * ulang bila perlu). Akun OAuth-only (`!passwordEnabled`) → mode "atur" tanpa field lama.
 */
export function PasswordPanel() {
  const { isLoaded, user } = useUser();
  const hasPassword = Boolean(user?.passwordEnabled);

  const updatePassword = useReverification(
    (params: { currentPassword?: string; newPassword: string }) =>
      user?.updatePassword({ ...params, signOutOfOtherSessions: true }),
  );

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    isLoaded && next.length > 0 && confirm.length > 0 && (!hasPassword || current.length > 0);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (next !== confirm) {
      toast.error("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setSubmitting(true);
    try {
      await updatePassword(hasPassword ? { currentPassword: current, newPassword: next } : { newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success(hasPassword ? "Kata sandi diperbarui." : "Kata sandi dibuat.");
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Gagal memperbarui kata sandi."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title={hasPassword ? "Kata sandi" : "Atur kata sandi"}
        description={
          hasPassword
            ? "Ganti kata sandi. Perangkat lain akan keluar otomatis."
            : "Akun kamu masuk lewat penyedia eksternal. Tambah kata sandi untuk login langsung."
        }
      />
      <form onSubmit={onSubmit}>
        <SettingsPanelBody className="grid max-w-md gap-4">
          {hasPassword ? (
            <SettingsField label="Kata sandi saat ini">
              <Input
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                disabled={submitting}
              />
            </SettingsField>
          ) : null}
          <SettingsField label="Kata sandi baru">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={submitting}
            />
          </SettingsField>
          <SettingsField label="Konfirmasi kata sandi baru">
            <Input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={submitting}
            />
          </SettingsField>
        </SettingsPanelBody>
        <SettingsPanelFooter className="justify-end">
          <Button type="submit" size="sm" disabled={!canSubmit || submitting}>
            {submitting ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {hasPassword ? "Simpan" : "Atur kata sandi"}
          </Button>
        </SettingsPanelFooter>
      </form>
    </SettingsPanel>
  );
}
