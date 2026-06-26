"use client";

import { useReverification, useUser } from "@clerk/nextjs";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { Button } from "@aqsha/ui/components/button";
import { Input } from "@aqsha/ui/components/input";
import { CopyIcon, DownloadIcon, Loader2Icon } from "@aqsha/ui/icons";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SettingsPanel,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPill,
} from "../components/settings-card";
import { clerkErrorMessage } from "./clerk-error";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Disalin.");
  } catch {
    toast.error("Gagal menyalin.");
  }
}

function downloadCodes(codes: string[]) {
  const blob = new Blob([codes.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aqsha-backup-codes.txt";
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Verifikasi dua langkah (TOTP authenticator app). Enrollment WAJIB frontend SDK
 * (Clerk Backend tak punya endpoint generate-secret+verify). Alur: createTOTP →
 * scan QR / entry manual → verifyTOTP → tampil backup codes. Aksi sensitif di-wrap
 * `useReverification`. Nonaktif via disableTOTP. Status reaktif dari `user.totpEnabled`.
 */
export function TwoFactorPanel() {
  const { isLoaded, user } = useUser();
  const enabled = Boolean(user?.totpEnabled);

  const createTotp = useReverification(() => user?.createTOTP());
  const verifyTotp = useReverification((code: string) => user?.verifyTOTP({ code }));
  const createBackup = useReverification(() => user?.createBackupCode());
  const disableTotp = useReverification(() => user?.disableTOTP());

  const [enrollOpen, setEnrollOpen] = useState(false);
  const [step, setStep] = useState<"scan" | "backup">("scan");
  const [totp, setTotp] = useState<{ uri: string | null; secret: string | null }>({
    uri: null,
    secret: null,
  });
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);

  function resetEnroll() {
    setStep("scan");
    setTotp({ uri: null, secret: null });
    setCode("");
    setCodes([]);
    setBusy(false);
  }

  async function startEnroll() {
    if (!user) return;
    setBusy(true);
    try {
      // createTOTP() memicu modal reverification Clerk (bila perlu). Jalankan DULU —
      // biar modal Clerk tampil sendirian — baru buka dialog QR kita setelah secret siap.
      // Mencegah dialog kita & modal Clerk muncul bersamaan.
      const res = await createTotp();
      setTotp({ uri: res?.uri ?? null, secret: res?.secret ?? null });
      setEnrollOpen(true);
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Gagal memulai aktivasi 2FA."));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!user || code.trim().length === 0) return;
    setBusy(true);
    try {
      await verifyTotp(code.trim());
      const backup = await createBackup();
      setCodes(backup?.codes ?? []);
      setStep("backup");
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Kode tidak valid. Coba lagi."));
    } finally {
      setBusy(false);
    }
  }

  function finishEnroll() {
    setEnrollOpen(false);
    resetEnroll();
    toast.success("Verifikasi dua langkah aktif.");
  }

  async function disable() {
    if (!user) return;
    // Tutup dialog konfirmasi kita DULU → modal reverification Clerk tampil sendirian.
    setDisableOpen(false);
    setBusy(true);
    try {
      await disableTotp();
      toast.success("Verifikasi dua langkah dinonaktifkan.");
    } catch (err) {
      toast.error(clerkErrorMessage(err, "Gagal menonaktifkan 2FA."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Verifikasi dua langkah"
        description="Tambahkan aplikasi autentikator (Google Authenticator, Authy, 1Password) sebagai lapisan keamanan kedua saat login."
        action={enabled ? <SettingsPill className="text-foreground">Aktif</SettingsPill> : null}
      />
      <SettingsPanelFooter className="justify-end">
        {enabled ? (
          <Dialog open={disableOpen} onOpenChange={setDisableOpen}>
            <Button variant="outline" size="sm" onClick={() => setDisableOpen(true)}>
              Nonaktifkan
            </Button>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Nonaktifkan verifikasi dua langkah?</DialogTitle>
                <DialogDescription>
                  Akun kamu hanya akan terlindungi kata sandi. Kamu bisa mengaktifkannya lagi kapan saja.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" size="sm" disabled={busy}>
                    Batal
                  </Button>
                </DialogClose>
                <Button variant="destructive" size="sm" disabled={busy} onClick={disable}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Nonaktifkan
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : (
          <Button size="sm" disabled={!isLoaded || busy} onClick={startEnroll}>
            {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
            Aktifkan
          </Button>
        )}
      </SettingsPanelFooter>

      {/* Dialog enrollment (scan → verify → backup codes) */}
      <Dialog
        open={enrollOpen}
        onOpenChange={(open) => {
          setEnrollOpen(open);
          if (!open) resetEnroll();
        }}
      >
        <DialogContent className="sm:max-w-md">
          {step === "scan" ? (
            <>
              <DialogHeader>
                <DialogTitle>Pindai kode QR</DialogTitle>
                <DialogDescription>
                  Pindai dengan aplikasi autentikator, lalu masukkan kode 6 digit yang muncul.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4">
                {totp.uri ? (
                  <div className="rounded-lg border border-border/70 bg-white p-3">
                    <QRCodeSVG value={totp.uri} size={160} />
                  </div>
                ) : null}
                {totp.secret ? (
                  <button
                    type="button"
                    onClick={() => copyText(totp.secret as string)}
                    className="inline-flex items-center gap-1.5 font-mono text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <CopyIcon className="size-3.5" />
                    {totp.secret}
                  </button>
                ) : null}
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  disabled={busy || !totp.uri}
                  className="max-w-[12rem] text-center tracking-widest"
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline" size="sm" disabled={busy}>
                    Batal
                  </Button>
                </DialogClose>
                <Button size="sm" disabled={busy || !totp.uri || code.trim().length === 0} onClick={verify}>
                  {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                  Verifikasi
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Simpan kode cadangan</DialogTitle>
                <DialogDescription>
                  Gunakan kode ini untuk masuk jika kehilangan akses ke aplikasi autentikator. Setiap kode hanya dipakai sekali.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-muted/30 p-4 font-mono text-[13px]">
                {codes.map((c) => (
                  <span key={c} className="text-center">
                    {c}
                  </span>
                ))}
              </div>
              <DialogFooter className="sm:justify-between">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyText(codes.join("\n"))}>
                    <CopyIcon className="size-4" />
                    Salin
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => downloadCodes(codes)}>
                    <DownloadIcon className="size-4" />
                    Unduh
                  </Button>
                </div>
                <Button size="sm" onClick={finishEnroll}>
                  Selesai
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SettingsPanel>
  );
}
