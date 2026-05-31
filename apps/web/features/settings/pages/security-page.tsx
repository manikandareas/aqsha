"use client";

import { useReverification, useSession, useUser } from "@clerk/nextjs";
import {
  KeyRoundIcon,
  LaptopIcon,
  LinkIcon,
  Loader2Icon,
  LockKeyholeIcon,
  LogOutIcon,
  PlusIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  UnlinkIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAccountDeletion } from "../api/use-account-deletion";
import { DeleteAccountPanel } from "../components/delete-account-panel";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
  SettingsPanelList,
  SettingsRow,
} from "../components/settings-card";
import { SettingsHeader } from "../components/settings-header";
import { useSettingsSecurityData } from "../api/use-settings-security-data";

type SecurityAction = "password" | "mfa" | "provider" | "session";
type SessionLike = {
  id?: string;
  status?: string;
  lastActiveAt?: Date | string | number | null;
  latestActivity?: {
    browserName?: string | null;
    browserVersion?: string | null;
    deviceType?: string | null;
    isMobile?: boolean | null;
    ipAddress?: string | null;
    city?: string | null;
    country?: string | null;
  } | null;
  revoke?: () => Promise<unknown>;
};

const actionButtonClass =
  "transition-[transform,background-color,border-color,color] duration-150 ease-out active:scale-[0.98]";

function readableClerkError(error: unknown, fallback: string) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "reverification_cancelled"
  ) {
    return "Verifikasi dibatalkan. Tidak ada perubahan yang disimpan.";
  }

  if (
    error &&
    typeof error === "object" &&
    "errors" in error &&
    Array.isArray((error as { errors?: unknown[] }).errors)
  ) {
    const [firstError] = (error as { errors: Array<{ code?: string; longMessage?: string; message?: string }> }).errors;
    if (firstError?.code === "reverification_cancelled") {
      return "Verifikasi dibatalkan. Tidak ada perubahan yang disimpan.";
    }
    return firstError?.longMessage || firstError?.message || fallback;
  }

  if (error instanceof Error) {
    if (error.message.includes("reverification_cancelled") || error.message.includes("cancelled attempted verification")) {
      return "Verifikasi dibatalkan. Tidak ada perubahan yang disimpan.";
    }
    return error.message || fallback;
  }
  return fallback;
}

function providerLabel(provider: string | null | undefined) {
  if (!provider) return "Provider";
  return provider
    .replace(/^oauth_/, "")
    .split(/[_-]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function ProviderIcon({ provider }: { provider: string | null | undefined }) {
  if (provider === "google") {
    return (
      <svg
        aria-hidden="true"
        className="size-4"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          fill="#4285F4"
        />
        <path
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          fill="#34A853"
        />
        <path
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
          fill="#FBBC05"
        />
        <path
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          fill="#EA4335"
        />
        <path d="M1 1h22v22H1z" fill="none" />
      </svg>
    );
  }

  return <LinkIcon className="size-4" />;
}

function formatSecurityDate(value: Date | string | number | null | undefined) {
  if (!value) return "Belum ada aktivitas";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Belum ada aktivitas";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function SecurityRow({
  icon,
  title,
  description,
  meta,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  meta?: string;
  children?: ReactNode;
}) {
  return (
    <SettingsRow className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 gap-3">
        <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/25 text-muted-foreground">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-foreground">{title}</p>
            {meta ? (
              <span className="rounded-full border border-border/70 bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {meta}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
      </div>
      {children ? <div className="flex flex-wrap gap-2 sm:justify-end">{children}</div> : null}
    </SettingsRow>
  );
}

function PasswordSection({
  user,
  busyAction,
  setBusyAction,
  setNotice,
  setError,
}: {
  user: NonNullable<ReturnType<typeof useUser>["user"]>;
  busyAction: SecurityAction | null;
  setBusyAction: (action: SecurityAction | null) => void;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const passwordEnabled = Boolean(user.passwordEnabled);
  const updatePassword = useReverification(
    async (params: {
      currentPassword?: string;
      newPassword: string;
      signOutOfOtherSessions: boolean;
    }) => await user.updatePassword(params),
  );

  const canSubmit =
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    (!passwordEnabled || currentPassword.length > 0) &&
    busyAction !== "password";

  async function savePassword() {
    if (!canSubmit) return;

    setBusyAction("password");
    setNotice(null);
    setError(null);
    try {
      await updatePassword({
        currentPassword: passwordEnabled ? currentPassword : undefined,
        newPassword,
        signOutOfOtherSessions: true,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setOpen(false);
      setNotice(passwordEnabled ? "Kata sandi berhasil diperbarui." : "Kata sandi berhasil dibuat.");
    } catch (passwordError) {
      setError(readableClerkError(passwordError, "Gagal memperbarui kata sandi."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid gap-2">
      <SecurityRow
        icon={<KeyRoundIcon className="size-4" />}
        title="Proteksi utama"
        description={
          passwordEnabled
            ? "Kata sandi aktif untuk akun ini. Perubahan sensitif akan meminta verifikasi ulang."
            : "Akun ini belum memiliki kata sandi karena masuk lewat provider sosial."
        }
        meta={passwordEnabled ? "Aktif" : "Belum dibuat"}
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className={actionButtonClass}
          onClick={() => setOpen((value) => !value)}
        >
          <LockKeyholeIcon className="size-3.5 text-primary" />
          {passwordEnabled ? "Ubah kata sandi" : "Buat kata sandi"}
        </Button>
      </SecurityRow>

      {open ? (
        <SettingsRow className="grid gap-3 bg-muted/15">
          <div className="grid gap-3 sm:grid-cols-3">
            {passwordEnabled ? (
              <Input
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="Kata sandi saat ini"
                className="h-[42px] rounded-lg border-input bg-background/80 px-3.5 text-[13px] shadow-none"
              />
            ) : null}
            <Input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Kata sandi baru"
              className="h-[42px] rounded-lg border-input bg-background/80 px-3.5 text-[13px] shadow-none"
            />
            <Input
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="Ulangi kata sandi baru"
              className="h-[42px] rounded-lg border-input bg-background/80 px-3.5 text-[13px] shadow-none"
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Minimal 8 karakter. Setelah tersimpan, sesi lain akan dikeluarkan untuk mengurangi risiko.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={!canSubmit}
              className={actionButtonClass}
              onClick={() => void savePassword()}
            >
              {busyAction === "password" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Simpan kata sandi
            </Button>
          </div>
        </SettingsRow>
      ) : null}
    </div>
  );
}

function MfaSection({
  user,
  busyAction,
  setBusyAction,
  setNotice,
  setError,
}: {
  user: NonNullable<ReturnType<typeof useUser>["user"]>;
  busyAction: SecurityAction | null;
  setBusyAction: (action: SecurityAction | null) => void;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const [setup, setSetup] = useState<{ secret?: string; uri?: string } | null>(null);
  const [code, setCode] = useState("");
  const totpEnabled = Boolean(user.totpEnabled);
  const twoFactorEnabled = Boolean(user.twoFactorEnabled);
  const createTotp = useReverification(async () => await user.createTOTP());
  const verifyTotp = useReverification(async (params: { code: string }) => await user.verifyTOTP(params));
  const disableTotp = useReverification(async () => await user.disableTOTP());

  async function startSetup() {
    setBusyAction("mfa");
    setNotice(null);
    setError(null);
    try {
      const totp = await createTotp();
      setSetup({
        secret: typeof totp?.secret === "string" ? totp.secret : undefined,
        uri: typeof totp?.uri === "string" ? totp.uri : undefined,
      });
    } catch (mfaError) {
      setError(readableClerkError(mfaError, "Gagal memulai setup MFA."));
    } finally {
      setBusyAction(null);
    }
  }

  async function confirmSetup() {
    if (code.trim().length < 6) return;

    setBusyAction("mfa");
    setNotice(null);
    setError(null);
    try {
      await verifyTotp({ code: code.trim() });
      await user.reload();
      setSetup(null);
      setCode("");
      setNotice("Authenticator app berhasil diaktifkan.");
    } catch (mfaError) {
      setError(readableClerkError(mfaError, "Kode MFA tidak valid."));
    } finally {
      setBusyAction(null);
    }
  }

  async function turnOffTotp() {
    setBusyAction("mfa");
    setNotice(null);
    setError(null);
    try {
      await disableTotp();
      await user.reload();
      setSetup(null);
      setCode("");
      setNotice("Authenticator app sudah dinonaktifkan.");
    } catch (mfaError) {
      setError(readableClerkError(mfaError, "Gagal menonaktifkan MFA."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="grid gap-2">
      <SecurityRow
        icon={<ShieldCheckIcon className="size-4" />}
        title="Authenticator app"
        description="Tambahkan authenticator app agar login membutuhkan kode kedua setelah kata sandi atau provider."
        meta={twoFactorEnabled ? "Aktif" : "Opsional"}
      >
        {totpEnabled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busyAction === "mfa"}
            className={actionButtonClass}
            onClick={() => void turnOffTotp()}
          >
            {busyAction === "mfa" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
            Nonaktifkan
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busyAction === "mfa"}
            className={actionButtonClass}
            onClick={() => void startSetup()}
          >
            {busyAction === "mfa" ? (
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
            ) : (
              <PlusIcon className="size-3.5 text-primary" />
            )}
            Aktifkan
          </Button>
        )}
      </SecurityRow>

      {setup ? (
        <SettingsRow className="grid gap-4 bg-muted/15">
          <div className="grid gap-2">
            <p className="text-[13px] font-semibold text-foreground">Hubungkan authenticator app</p>
            <p className="text-[12px] leading-relaxed text-muted-foreground">
              Salin secret ini ke Google Authenticator, 1Password, atau authenticator app lain, lalu masukkan kode 6 digit.
            </p>
          </div>
          {setup.secret ? (
            <code className="overflow-x-auto rounded-lg border border-border/70 bg-background/80 px-3 py-2 font-mono text-[12px] text-foreground">
              {setup.secret}
            </code>
          ) : null}
          {setup.uri ? (
            <p className="break-all text-[11px] leading-relaxed text-muted-foreground">{setup.uri}</p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Kode 6 digit"
              className="h-[42px] max-w-[220px] rounded-lg border-input bg-background/80 px-3.5 text-[13px] shadow-none"
            />
            <Button
              type="button"
              size="sm"
              disabled={busyAction === "mfa" || code.trim().length < 6}
              className={actionButtonClass}
              onClick={() => void confirmSetup()}
            >
              {busyAction === "mfa" ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
              Verifikasi
            </Button>
          </div>
        </SettingsRow>
      ) : null}
    </div>
  );
}

function ConnectedAccountsSection({
  user,
  busyAction,
  setBusyAction,
  setNotice,
  setError,
}: {
  user: NonNullable<ReturnType<typeof useUser>["user"]>;
  busyAction: SecurityAction | null;
  setBusyAction: (action: SecurityAction | null) => void;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const accounts = user.externalAccounts ?? [];
  const hasGoogle = accounts.some((account) => account.provider === "google");
  const createExternalAccount = useReverification(
    async () =>
      await user.createExternalAccount({
        strategy: "oauth_google",
        redirectUrl: "/app/settings/security",
      }),
  );
  const destroyExternalAccount = useReverification(async (account: (typeof accounts)[number]) => await account.destroy());

  async function connectGoogle() {
    setBusyAction("provider");
    setNotice(null);
    setError(null);
    try {
      const result = await createExternalAccount();
      const redirectUrl = result?.verification?.externalVerificationRedirectURL;
      if (redirectUrl) {
        window.location.href = redirectUrl.href;
        return;
      }
      setNotice("Provider Google berhasil ditambahkan.");
    } catch (providerError) {
      setError(readableClerkError(providerError, "Gagal menghubungkan provider."));
      setBusyAction(null);
    }
  }

  async function disconnect(account: (typeof accounts)[number]) {
    setBusyAction("provider");
    setNotice(null);
    setError(null);
    try {
      await destroyExternalAccount(account);
      await user.reload();
      setNotice("Provider berhasil dilepas.");
    } catch (providerError) {
      setError(readableClerkError(providerError, "Gagal melepas provider."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <SettingsPanelList>
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <SettingsRow
              key={account.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background/80 text-muted-foreground">
                  <ProviderIcon provider={account.provider} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">
                    {providerLabel(account.provider)}
                  </p>
                  <p className="truncate text-[12px] text-muted-foreground">
                    {account.emailAddress || account.username || account.providerUserId || "Akun eksternal"}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyAction === "provider"}
                className={cn(actionButtonClass, "text-muted-foreground")}
                onClick={() => void disconnect(account)}
              >
                <UnlinkIcon className="size-3.5" />
                Lepas
              </Button>
            </SettingsRow>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-border/70 px-3.5 py-3 text-[13px] text-muted-foreground">
            Belum ada provider sosial yang tersambung.
          </p>
        )}
      </SettingsPanelList>
      {!hasGoogle ? (
        <SettingsPanelFooter className="justify-end">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={busyAction === "provider"}
            className={actionButtonClass}
            onClick={() => void connectGoogle()}
          >
            {busyAction === "provider" ? (
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
            ) : (
              <ProviderIcon provider="google" />
            )}
            Tambah Google
          </Button>
        </SettingsPanelFooter>
      ) : null}
    </>
  );
}

function sessionLabel(session: SessionLike) {
  const activity = session.latestActivity;
  const browser = [activity?.browserName, activity?.browserVersion].filter(Boolean).join(" ");
  const device = activity?.deviceType || (activity?.isMobile ? "Mobile" : "Desktop");
  return [device, browser].filter(Boolean).join(" · ") || "Session";
}

function sessionLocation(session: SessionLike) {
  const activity = session.latestActivity;
  return [activity?.city, activity?.country].filter(Boolean).join(", ") || activity?.ipAddress || "Lokasi tidak tersedia";
}

function ActiveSessionsSection({
  user,
  currentSessionId,
  busyAction,
  setBusyAction,
  setNotice,
  setError,
}: {
  user: NonNullable<ReturnType<typeof useUser>["user"]>;
  currentSessionId?: string;
  busyAction: SecurityAction | null;
  setBusyAction: (action: SecurityAction | null) => void;
  setNotice: (message: string | null) => void;
  setError: (message: string | null) => void;
}) {
  const [sessions, setSessions] = useState<SessionLike[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const nextSessions = await user.getSessions();
      setSessions(nextSessions as SessionLike[]);
    } catch (sessionsError) {
      setError(readableClerkError(sessionsError, "Gagal memuat sesi aktif."));
    } finally {
      setLoadingSessions(false);
    }
  }, [setError, user]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadSessions();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [loadSessions]);

  async function revokeSession(session: SessionLike) {
    if (!session.id || session.id === currentSessionId || !session.revoke) return;

    setBusyAction("session");
    setNotice(null);
    setError(null);
    try {
      await session.revoke();
      await loadSessions();
      setNotice("Sesi perangkat lain berhasil dikeluarkan.");
    } catch (sessionError) {
      setError(readableClerkError(sessionError, "Gagal mengeluarkan sesi."));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <SettingsPanelList>
      {loadingSessions ? (
        <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/25 px-3.5 py-3 text-[13px] text-muted-foreground">
          <Loader2Icon className="size-3.5 animate-spin" />
          Memuat sesi aktif...
        </div>
      ) : sessions.length > 0 ? (
        sessions.map((session) => {
          const isCurrent = session.id === currentSessionId;
          return (
            <SettingsRow
              key={session.id}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="flex min-w-0 gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background/80 text-muted-foreground">
                  {session.latestActivity?.isMobile ? (
                    <SmartphoneIcon className="size-4" />
                  ) : (
                    <LaptopIcon className="size-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] font-semibold text-foreground">
                      {sessionLabel(session)}
                    </p>
                    {isCurrent ? (
                      <span className="rounded-full border border-mint-soft-border bg-mint-soft px-2 py-0.5 text-[11px] font-medium text-mint-foreground">
                        Sesi ini
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    {sessionLocation(session)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Terakhir aktif {formatSecurityDate(session.lastActiveAt)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isCurrent || busyAction === "session"}
                className={cn(actionButtonClass, "text-muted-foreground")}
                onClick={() => void revokeSession(session)}
              >
                <LogOutIcon className="size-3.5" />
                Keluar
              </Button>
            </SettingsRow>
          );
        })
      ) : (
        <p className="rounded-lg border border-dashed border-border/70 px-3.5 py-3 text-[13px] text-muted-foreground">
          Tidak ada sesi aktif yang bisa ditampilkan.
        </p>
      )}
    </SettingsPanelList>
  );
}

function ClerkSecurityControls() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { session } = useSession();
  const [busyAction, setBusyAction] = useState<SecurityAction | null>(null);
  const setNotice = (message: string | null) => {
    if (message) toast.success(message);
  };
  const setError = (message: string | null) => {
    if (message) toast.error(message);
  };

  if (!isLoaded) {
    return (
      <SettingsPanel>
        <SettingsPanelHeader
          title="Keamanan akun"
          description="Memuat data keamanan dari Clerk."
        />
        <SettingsPanelBody>
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Memuat keamanan Clerk...
          </div>
        </SettingsPanelBody>
      </SettingsPanel>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <SettingsPanel>
        <SettingsPanelHeader
          title="Keamanan akun"
          description="Sesi Clerk diperlukan untuk mengelola keamanan."
        />
        <SettingsPanelBody>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Kamu perlu masuk lagi untuk mengelola keamanan akun.
          </p>
        </SettingsPanelBody>
      </SettingsPanel>
    );
  }

  return (
    <>
      <SettingsPanel>
        <SettingsPanelHeader
          title="Keamanan masuk"
          description="Kelola kata sandi dan verifikasi tambahan untuk akun kamu."
        />
        <SettingsPanelList>
          <PasswordSection
            user={user}
            busyAction={busyAction}
            setBusyAction={setBusyAction}
            setNotice={setNotice}
            setError={setError}
          />
          <MfaSection
            user={user}
            busyAction={busyAction}
            setBusyAction={setBusyAction}
            setNotice={setNotice}
            setError={setError}
          />
        </SettingsPanelList>
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Provider sosial"
          description={`Kelola akun eksternal yang bisa dipakai untuk masuk.${(user.externalAccounts?.length ?? 0) > 0 ? ` ${user.externalAccounts?.length ?? 0} tersambung.` : ""}`}
        />
        <ConnectedAccountsSection
          user={user}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setNotice={setNotice}
          setError={setError}
        />
      </SettingsPanel>

      <SettingsPanel>
        <SettingsPanelHeader
          title="Sesi aktif"
          description="Lihat perangkat yang masih login dan keluarkan sesi lain bila perlu."
        />
        <ActiveSessionsSection
          user={user}
          currentSessionId={session?.id}
          busyAction={busyAction}
          setBusyAction={setBusyAction}
          setNotice={setNotice}
          setError={setError}
        />
      </SettingsPanel>
    </>
  );
}

export function SettingsSecurityPage() {
  const { viewer } = useSettingsSecurityData();
  const accountDeletion = useAccountDeletion();

  if (!viewer) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="security" />

      <ClerkSecurityControls />

      <DeleteAccountPanel
        pending={accountDeletion.pending}
        onDeleteAccount={() => void accountDeletion.deleteAccount()}
      />
    </>
  );
}
