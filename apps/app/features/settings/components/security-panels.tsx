"use client";

import {
  GitBranchIcon,
  GlobeIcon,
  KeyRoundIcon,
  LaptopIcon,
  Loader2Icon,
  LogOutIcon,
  MailIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SecuritySettingsController } from "../api/use-security-settings-controller";
import type { OAuthProvider } from "../lib/security-auth-client";
import {
  SettingsField,
  SettingsListItem,
  SettingsPanel,
  SettingsPanelBody,
  SettingsPanelFooter,
  SettingsPanelHeader,
} from "./settings-card";

const oauthProviders = [
  { key: "github", label: "GitHub", icon: GitBranchIcon },
  { key: "google", label: "Google", icon: GlobeIcon },
] as const;

export function SecurityAuthenticationPanel({
  controller,
}: {
  controller: SecuritySettingsController;
}) {
  const { viewer, capabilities, accounts, credentialAccount, pendingKey, linkProvider } =
    controller;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Autentikasi"
        description="Email dan provider sosial yang bisa dipakai untuk masuk ke akun ini."
      />
      <SettingsPanelBody>
        <SettingsListItem
          icon={MailIcon}
          title="Email & kata sandi"
          subtitle={viewer?.email ?? "Belum diisi"}
          trailing={
            <span className="text-[11px] text-muted-foreground">
              {credentialAccount ? "Terhubung" : "Belum ada password"}
            </span>
          }
        />
        {oauthProviders.map((provider) => {
          const Icon = provider.icon;
          const configured = Boolean(capabilities?.oauthProviders[provider.key]);
          const connected = accounts.some(
            (account) => account.providerId === provider.key,
          );
          const pending = pendingKey === `oauth-${provider.key}`;

          return (
            <SettingsListItem
              key={provider.key}
              icon={Icon}
              title={provider.label}
              subtitle={oauthProviderSubtitle({ configured, connected })}
              trailing={
                connected ? (
                  <span className="text-[11px] text-muted-foreground">Terhubung</span>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!configured || pending}
                    onClick={() => void linkProvider(provider.key)}
                  >
                    {pending ? <Loader2Icon className="size-3.5 animate-spin" /> : null}
                    Hubungkan
                  </Button>
                )
              }
            />
          );
        })}
      </SettingsPanelBody>
    </SettingsPanel>
  );
}

export function SecurityPasswordPanel({
  controller,
}: {
  controller: SecuritySettingsController;
}) {
  const {
    currentPassword,
    setCurrentPassword,
    newPassword,
    setNewPassword,
    viewerEmail,
    pendingKey,
    changePassword,
    sendPasswordReset,
  } = controller;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Kata sandi"
        description="Ubah password langsung atau kirim ulang link reset lewat email."
      />
      <SettingsPanelBody className="grid gap-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField label="Password saat ini">
            <Input
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
              className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
            />
          </SettingsField>
          <SettingsField label="Password baru">
            <Input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              minLength={8}
              className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
            />
          </SettingsField>
        </div>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={
            pendingKey === "change-password" ||
            currentPassword.length < 1 ||
            newPassword.length < 8
          }
          onClick={() => void changePassword()}
        >
          {pendingKey === "change-password" ? (
            <Loader2Icon className="size-3.5 animate-spin text-primary" />
          ) : (
            <KeyRoundIcon className="size-3.5 text-primary" />
          )}
          Simpan password
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!viewerEmail || pendingKey === "reset-password"}
          onClick={() => void sendPasswordReset()}
        >
          {pendingKey === "reset-password" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <RefreshCwIcon className="size-3.5" />
          )}
          Kirim link reset
        </Button>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}

export function SecuritySessionsPanel({
  controller,
}: {
  controller: SecuritySettingsController;
}) {
  const {
    sessions,
    loadingSecurity,
    pendingKey,
    revokeSession,
    revokeOtherSessions,
    signOut,
  } = controller;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Sesi aktif"
        description="Cabut akses perangkat lama tanpa keluar dari semua perangkat."
      />
      <SettingsPanelBody>
        {loadingSecurity ? (
          <p className="text-[13px] text-muted-foreground">Memuat sesi...</p>
        ) : sessions.length > 0 ? (
          sessions.map((session) => (
            <SettingsListItem
              key={session.token}
              icon={LaptopIcon}
              title={session.userAgent || "Perangkat tidak dikenal"}
              subtitle={`${session.ipAddress ?? "IP tidak tersedia"} · Kadaluarsa ${formatDate(session.expiresAt)}`}
              trailing={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pendingKey === `session-${session.token}`}
                  onClick={() => void revokeSession(session.token)}
                >
                  {pendingKey === `session-${session.token}` ? (
                    <Loader2Icon className="size-3.5 animate-spin" />
                  ) : null}
                  Cabut
                </Button>
              }
            />
          ))
        ) : (
          <p className="text-[13px] text-muted-foreground">Tidak ada sesi lain yang tercatat.</p>
        )}
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pendingKey === "sessions-other"}
          onClick={() => void revokeOtherSessions()}
        >
          {pendingKey === "sessions-other" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheckIcon className="size-3.5" />
          )}
          Cabut sesi lain
        </Button>
        <Button type="button" variant="destructive" size="sm" onClick={signOut}>
          <LogOutIcon className="size-3.5" />
          Keluar
        </Button>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}

export function SecurityDeleteAccountPanel({
  controller,
}: {
  controller: SecuritySettingsController;
}) {
  const {
    deletePassword,
    setDeletePassword,
    deleteConfirmation,
    setDeleteConfirmation,
    pendingKey,
    deleteAccount,
  } = controller;

  return (
    <SettingsPanel>
      <SettingsPanelHeader
        title="Hapus akun"
        description="Aqsha akan membersihkan data, file storage, sesi, dan identitas autentikasi setelah konfirmasi email."
      />
      <SettingsPanelBody className="grid gap-5">
        <SettingsField
          label="Password akun"
          description="Opsional untuk akun sosial, wajib jika akun memakai email & password."
        >
          <Input
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            type="password"
            autoComplete="current-password"
            className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
          />
        </SettingsField>
        <SettingsField label="Ketik HAPUS untuk melanjutkan">
          <Input
            value={deleteConfirmation}
            onChange={(event) => setDeleteConfirmation(event.target.value)}
            className="h-[42px] rounded-lg border-input bg-muted/40 px-3.5 text-[13px] shadow-none"
          />
        </SettingsField>
      </SettingsPanelBody>
      <SettingsPanelFooter>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={deleteConfirmation !== "HAPUS" || pendingKey === "delete-account"}
          onClick={() => void deleteAccount()}
        >
          {pendingKey === "delete-account" ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <Trash2Icon className="size-3.5" />
          )}
          Hapus akun permanen
        </Button>
      </SettingsPanelFooter>
    </SettingsPanel>
  );
}

function oauthProviderSubtitle({
  configured,
  connected,
}: {
  configured: boolean;
  connected: boolean;
}) {
  if (!configured) return "Konfigurasi provider belum lengkap di environment.";
  return connected
    ? "Provider sosial terhubung ke akun ini."
    : "Hubungkan untuk masuk tanpa kata sandi.";
}

function formatDate(value: Date | string) {
  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type { OAuthProvider };
