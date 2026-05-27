"use client";

import { useSettingsSecurityController } from "../api/use-settings-security-controller";
import { LoadingSettingsPage } from "../components/loading-settings-page";
import {
  AuthProvidersPanel,
  DeleteAccountPanel,
  PasswordPanel,
  SecurityFeedback,
  SessionsPanel,
} from "../components/security-panels";
import { SettingsHeader } from "../components/settings-header";

export function SettingsSecurityPage() {
  const security = useSettingsSecurityController();

  if (!security.viewer || !security.authConfig) return <LoadingSettingsPage />;

  return (
    <>
      <SettingsHeader section="security" />
      <SecurityFeedback notice={security.notice} error={security.error} />
      <AuthProvidersPanel
        viewer={security.viewer}
        authConfig={security.authConfig}
        accounts={security.accounts}
        linkedProviders={security.linkedProviders}
        pendingKey={security.pendingKey}
        onLinkProvider={security.linkProvider}
        onUnlinkProvider={security.unlinkProvider}
      />
      <PasswordPanel
        viewer={security.viewer}
        authConfig={security.authConfig}
        pendingKey={security.pendingKey}
        passwordForm={security.passwordForm}
        setPasswordForm={security.setPasswordForm}
        onChangePassword={security.changePassword}
        onSendResetPassword={security.sendResetPassword}
      />
      <SessionsPanel
        sessions={security.sessions}
        pendingKey={security.pendingKey}
        onRevokeSession={security.revokeSession}
        onRevokeOtherSessions={security.revokeOtherSessions}
        onSignOut={security.signOut}
      />
      <DeleteAccountPanel
        authConfig={security.authConfig}
        pendingKey={security.pendingKey}
        deleteForm={security.deleteForm}
        setDeleteForm={security.setDeleteForm}
        onDeleteAccount={security.deleteAccount}
      />
    </>
  );
}
