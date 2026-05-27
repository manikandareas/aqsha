"use client";

import { useState, type FormEvent } from "react";
import { Loader2Icon, MailCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { useSettingsAccountData } from "../api/use-settings-account-data";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import { DisplayNamePanel } from "../components/display-name-field";
import { ProfileAvatarPicker } from "../components/profile-avatar-picker";
import {
  SettingsField,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelHeader,
  SettingsReadonlyValue,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";

export function SettingsAccountPage() {
  const { viewer } = useSettingsAccountData();
  if (!viewer) return <LoadingSettingsPage />;

  const name = viewer.name || "Pengguna Aqsha";
  const email = viewer.email || "Belum masuk";

  return (
    <>
      <SettingsHeader section="account" />

      <SettingsPanel>
        <SettingsPanelHeader
          title="Profil"
          description="Informasi yang ditampilkan di sidebar dan menu pengguna."
        />
        <SettingsPanelBody>
          <div className="flex items-center gap-4">
            <ProfileAvatarPicker name={name} email={email} image={viewer.image} />
            <div className="min-w-0">
              <p className="truncate text-[15px] font-semibold text-foreground">{name}</p>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">{email}</p>
            </div>
          </div>
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Email kamu"
          description="Perubahan email dikonfirmasi lewat email lama sebelum alamat baru aktif."
        />
        <SettingsPanelBody className="grid gap-5">
          <SettingsField label="Alamat email">
            <SettingsReadonlyValue value={viewer.email ?? "Belum diisi"} />
          </SettingsField>
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 py-1">
              <MailCheckIcon className="size-3" />
              {viewer.emailVerified ? "Terverifikasi" : "Belum terverifikasi"}
            </span>
          </div>
          <ChangeEmailForm currentEmail={viewer.email} />
        </SettingsPanelBody>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Detail akun"
          description="Identitas disimpan oleh penyedia autentikasi."
        />
        <DisplayNamePanel savedName={viewer.name} />
      </SettingsPanel>
    </>
  );
}

function ChangeEmailForm({ currentEmail }: { currentEmail: string | null }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextEmail = email.trim();
    if (!nextEmail || nextEmail === currentEmail) return;

    setIsPending(true);
    setError(null);
    setStatus(null);
    try {
      const result = await authClient.changeEmail({
        newEmail: nextEmail,
        callbackURL: `${window.location.origin}/settings/account`,
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Gagal mengubah email.");
      }
      setEmail("");
      setStatus("Cek email lama kamu untuk mengonfirmasi perubahan alamat.");
    } catch (changeError) {
      setError(readableAuthError(changeError, "Gagal mengubah email."));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="grid gap-2">
        <Label htmlFor="new-email" className="text-[13px] font-medium">
          Email baru
        </Label>
        <Input
          id="new-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@email.com"
          className="h-[42px] rounded-lg text-[13px]"
        />
      </div>
      {status ? <p className="text-[12px] text-mint-foreground">{status}</p> : null}
      {error ? <p className="text-[12px] text-coral-foreground">{error}</p> : null}
      <Button
        type="submit"
        variant="outline"
        disabled={isPending || !email.trim() || email.trim() === currentEmail}
        className="h-9 w-fit rounded-lg text-[13px]"
      >
        {isPending ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
        Kirim konfirmasi
      </Button>
    </form>
  );
}

function readableAuthError(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
