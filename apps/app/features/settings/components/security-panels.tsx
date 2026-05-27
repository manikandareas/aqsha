"use client";

import {
  GitBranchIcon,
  KeyRoundIcon,
  type LucideIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SecurityPendingKey } from "../api/use-settings-security-controller";
import type {
  SecurityAccount,
  SecurityProviderId,
  SecuritySession,
} from "../api/security-auth-client";
import type { Viewer } from "../lib/types";
import {
  SettingsListItem,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "./settings-card";

type AuthConfig = {
  emailDeliveryConfigured: boolean;
  oauthProviders: Record<SecurityProviderId, boolean>;
};

type PasswordFormState = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type DeleteFormState = {
  password: string;
  confirmation: string;
};

const providers: Array<{
  id: SecurityProviderId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "github", label: "GitHub", icon: GitBranchIcon },
  { id: "google", label: "Google", icon: ShieldCheckIcon },
];

export function SecurityFeedback({
  notice,
  error,
}: {
  notice: string | null;
  error: string | null;
}) {
  return (
    <>
      {notice ? (
        <div className="rounded-[12px] border border-mint-soft-border bg-mint-soft px-4 py-3 text-sm font-medium leading-6 text-mint-foreground">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-[12px] border border-coral-soft-border bg-coral-soft px-4 py-3 text-sm font-medium leading-6 text-coral-foreground">
          {error}
        </div>
      ) : null}
    </>
  );
}

export function AuthProvidersPanel({
  viewer,
  authConfig,
  accounts,
  linkedProviders,
  pendingKey,
  onLinkProvider,
  onUnlinkProvider,
}: {
  viewer: Viewer;
  authConfig: AuthConfig;
  accounts: SecurityAccount[];
  linkedProviders: Set<string>;
  pendingKey: SecurityPendingKey;
  onLinkProvider: (provider: SecurityProviderId) => void;
  onUnlinkProvider: (provider: SecurityProviderId, account: SecurityAccount) => void;
}) {
  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Autentikasi"
        description="Email, kata sandi, dan akun OAuth yang bisa digunakan untuk masuk."
      />
      <SettingsPanelBody>
        <SettingsListItem
          icon={MailIcon}
          title="Email & kata sandi"
          subtitle={viewer.email ?? "Belum diisi"}
          trailing={
            <span className="text-[11px] text-muted-foreground">
              {viewer.emailVerified ? "Terverifikasi" : "Belum terverifikasi"}
            </span>
          }
        />
        {providers.map((provider) => {
          const configured = authConfig.oauthProviders[provider.id];
          const linked = accounts.find((account) => account.providerId === provider.id);
          return (
            <SettingsListItem
              key={provider.id}
              icon={provider.icon}
              title={provider.label}
              subtitle={providerSubtitle({
                configured,
                linked: linkedProviders.has(provider.id),
              })}
              trailing={
                linked ? (
                  <ProviderButton
                    label="Putuskan"
                    pending={pendingKey === `unlink:${provider.id}`}
                    onClick={() => onUnlinkProvider(provider.id, linked)}
                  />
                ) : (
                  <ProviderButton
                    label="Hubungkan"
                    pending={pendingKey === `link:${provider.id}`}
                    disabled={!configured}
                    onClick={() => onLinkProvider(provider.id)}
                  />
                )
              }
            />
          );
        })}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

export function PasswordPanel({
  viewer,
  authConfig,
  pendingKey,
  passwordForm,
  setPasswordForm,
  onChangePassword,
  onSendResetPassword,
}: {
  viewer: Viewer;
  authConfig: AuthConfig;
  pendingKey: SecurityPendingKey;
  passwordForm: PasswordFormState;
  setPasswordForm: Dispatch<SetStateAction<PasswordFormState>>;
  onChangePassword: (event: FormEvent<HTMLFormElement>) => void;
  onSendResetPassword: () => void;
}) {
  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Kata sandi"
        description="Reset email membutuhkan Resend agar tautan dapat dikirim."
      />
      <SettingsPanelBody>
        <form onSubmit={onChangePassword} className="grid gap-4">
          <PasswordField
            id="current-password"
            label="Kata sandi saat ini"
            autoComplete="current-password"
            value={passwordForm.currentPassword}
            onChange={(currentPassword) =>
              setPasswordForm((value) => ({ ...value, currentPassword }))
            }
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <PasswordField
              id="new-password"
              label="Kata sandi baru"
              autoComplete="new-password"
              value={passwordForm.newPassword}
              onChange={(newPassword) =>
                setPasswordForm((value) => ({ ...value, newPassword }))
              }
            />
            <PasswordField
              id="confirm-new-password"
              label="Konfirmasi"
              autoComplete="new-password"
              value={passwordForm.confirmPassword}
              onChange={(confirmPassword) =>
                setPasswordForm((value) => ({ ...value, confirmPassword }))
              }
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              disabled={
                pendingKey === "password:change" ||
                !passwordForm.currentPassword ||
                !passwordForm.newPassword
              }
              className="h-9 rounded-lg text-[13px]"
            >
              {pendingKey === "password:change" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <KeyRoundIcon className="size-3.5" />
              )}
              Simpan kata sandi
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={
                pendingKey === "password:reset" ||
                !authConfig.emailDeliveryConfigured ||
                !viewer.email
              }
              onClick={onSendResetPassword}
              className="h-9 rounded-lg text-[13px]"
            >
              {pendingKey === "password:reset" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : (
                <MailIcon className="size-3.5" />
              )}
              Kirim reset
            </Button>
          </div>
        </form>
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

export function SessionsPanel({
  sessions,
  pendingKey,
  onRevokeSession,
  onRevokeOtherSessions,
  onSignOut,
}: {
  sessions: SecuritySession[];
  pendingKey: SecurityPendingKey;
  onRevokeSession: (session: SecuritySession) => void;
  onRevokeOtherSessions: () => void;
  onSignOut: () => void;
}) {
  return (
    <SettingsPanel>
      <SettingsPanelHeader title="Sesi" description="Cabut akses dari perangkat lain." />
      <SettingsPanelBody>
        {sessions.length ? (
          sessions.map((session) => (
            <SettingsListItem
              key={session.id}
              icon={ShieldCheckIcon}
              title={session.userAgent || "Perangkat tanpa nama"}
              subtitle={`Berakhir ${formatDate(session.expiresAt)}${
                session.ipAddress ? ` · ${session.ipAddress}` : ""
              }`}
              trailing={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingKey === `session:${session.token}`}
                  onClick={() => onRevokeSession(session)}
                  className="h-8 rounded-lg text-[12px]"
                >
                  {pendingKey === `session:${session.token}` ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : null}
                  Cabut
                </Button>
              }
            />
          ))
        ) : (
          <p className="text-[13px] text-muted-foreground">Sesi belum termuat.</p>
        )}
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onRevokeOtherSessions}
          disabled={pendingKey === "sessions:other"}
          className="h-9 rounded-lg px-4 text-[13px] font-medium"
        >
          {pendingKey === "sessions:other" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : null}
          Keluar dari sesi lain
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={onSignOut}
          className="h-9 rounded-lg px-4 text-[13px] font-medium"
        >
          <LogOutIcon className="size-3.5" />
          Keluar
        </Button>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}

export function DeleteAccountPanel({
  authConfig,
  pendingKey,
  deleteForm,
  setDeleteForm,
  onDeleteAccount,
}: {
  authConfig: AuthConfig;
  pendingKey: SecurityPendingKey;
  deleteForm: DeleteFormState;
  setDeleteForm: Dispatch<SetStateAction<DeleteFormState>>;
  onDeleteAccount: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Hapus akun"
        description="Penghapusan berjalan setelah konfirmasi email dan membersihkan data milik akun."
      />
      <SettingsPanelBody>
        <form onSubmit={onDeleteAccount} className="grid gap-4">
          <PasswordField
            id="delete-password"
            label="Kata sandi"
            autoComplete="current-password"
            value={deleteForm.password}
            onChange={(password) => setDeleteForm((value) => ({ ...value, password }))}
          />
          <div className="grid gap-2">
            <Label htmlFor="delete-confirmation" className="text-[13px] font-medium">
              Ketik HAPUS
            </Label>
            <Input
              id="delete-confirmation"
              value={deleteForm.confirmation}
              onChange={(event) =>
                setDeleteForm((value) => ({
                  ...value,
                  confirmation: event.target.value,
                }))
              }
              className="h-[42px] rounded-lg text-[13px]"
            />
          </div>
          <Button
            type="submit"
            variant="destructive"
            disabled={
              pendingKey === "account:delete" ||
              deleteForm.confirmation !== "HAPUS" ||
              !authConfig.emailDeliveryConfigured
            }
            className="h-9 w-fit rounded-lg text-[13px]"
          >
            {pendingKey === "account:delete" ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <Trash2Icon className="size-3.5" />
            )}
            Kirim konfirmasi hapus
          </Button>
        </form>
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

function ProviderButton({
  label,
  pending,
  disabled,
  onClick,
}: {
  label: string;
  pending: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || pending}
      onClick={onClick}
      className="h-8 rounded-lg text-[12px]"
    >
      {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
      {label}
    </Button>
  );
}

function PasswordField({
  id,
  label,
  autoComplete,
  value,
  onChange,
}: {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </Label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        minLength={8}
        className="h-[42px] rounded-lg text-[13px]"
      />
    </div>
  );
}

function providerSubtitle({
  configured,
  linked,
}: {
  configured: boolean;
  linked: boolean;
}) {
  if (!configured) return "Belum dikonfigurasi di environment";
  return linked ? "Terhubung ke akun ini" : "Siap dihubungkan";
}

function formatDate(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "tidak diketahui";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
