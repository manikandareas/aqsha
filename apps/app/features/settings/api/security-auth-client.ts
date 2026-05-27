"use client";

import { authClient } from "@/lib/auth-client";

export type SecurityProviderId = "github" | "google";

export type SecuritySession = {
  id: string;
  token: string;
  expiresAt: string | Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export type SecurityAccount = {
  id: string;
  providerId: string;
  accountId: string | undefined;
};

export type SecurityAuthState = {
  sessions: SecuritySession[];
  accounts: SecurityAccount[];
};

type AuthClientSession = {
  id: string;
  token: string;
  expiresAt: string | Date;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuthClientAccount = {
  id: string;
  providerId: string;
  accountId?: string;
};

export async function listSecurityAuthState(): Promise<SecurityAuthState> {
  const [sessionResult, accountResult] = await Promise.all([
    authClient.listSessions(),
    authClient.listAccounts(),
  ]);

  if (sessionResult.error) {
    throw new Error(sessionResult.error.message ?? "Gagal memuat sesi.");
  }
  if (accountResult.error) {
    throw new Error(accountResult.error.message ?? "Gagal memuat akun OAuth.");
  }

  return {
    sessions: (sessionResult.data ?? []).map(normalizeSession),
    accounts: (accountResult.data ?? []).map(normalizeAccount),
  };
}

export async function linkSecurityProvider(args: {
  provider: SecurityProviderId;
  callbackURL: string;
}) {
  const result = await authClient.linkSocial(args);
  throwIfAuthError(result, "Gagal menghubungkan akun.");
}

export async function unlinkSecurityProvider(account: SecurityAccount) {
  const result = await authClient.unlinkAccount({
    providerId: account.providerId,
    accountId: account.accountId,
  });
  throwIfAuthError(result, "Gagal memutus akun.");
}

export async function revokeSecuritySession(token: string) {
  const result = await authClient.revokeSession({ token });
  throwIfAuthError(result, "Gagal mencabut sesi.");
}

export async function revokeOtherSecuritySessions() {
  const result = await authClient.revokeOtherSessions();
  throwIfAuthError(result, "Gagal mencabut sesi lain.");
}

export async function requestSecurityPasswordReset(args: {
  email: string;
  redirectTo: string;
}) {
  const result = await authClient.requestPasswordReset(args);
  throwIfAuthError(result, "Gagal mengirim reset.");
}

export async function changeSecurityPassword(args: {
  currentPassword: string;
  newPassword: string;
}) {
  const result = await authClient.changePassword({
    ...args,
    revokeOtherSessions: true,
  });
  throwIfAuthError(result, "Gagal mengubah kata sandi.");
}

export async function deleteSecurityUser(args: {
  password?: string;
  callbackURL: string;
}) {
  const result = await authClient.deleteUser(args);
  throwIfAuthError(result, "Gagal memulai penghapusan.");
}

export async function signOutSecurityUser() {
  await authClient.signOut();
}

function normalizeSession(session: AuthClientSession): SecuritySession {
  return {
    id: session.id,
    token: session.token,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
  };
}

function normalizeAccount(account: AuthClientAccount): SecurityAccount {
  return {
    id: account.id,
    providerId: account.providerId,
    accountId: account.accountId,
  };
}

function throwIfAuthError(
  result: { error?: { message?: string | null } | null },
  fallback: string,
) {
  if (result.error) {
    throw new Error(result.error.message ?? fallback);
  }
}
