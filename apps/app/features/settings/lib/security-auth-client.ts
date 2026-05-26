"use client";

import { authClient } from "@/lib/auth-client";

export type OAuthProvider = "github" | "google";

export type AuthAccount = {
  id: string;
  providerId: string;
  accountId: string;
  createdAt?: Date | string;
};

export type AuthSession = {
  id?: string;
  token: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  expiresAt: Date | string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type AuthResult<T> = {
  data?: T | null;
  error?: { message?: string | null } | null;
};

type SecurityAuthClient = {
  listAccounts: () => Promise<AuthResult<AuthAccount[]> | AuthAccount[]>;
  listSessions: () => Promise<AuthResult<AuthSession[]> | AuthSession[]>;
  revokeSession: (body: { token: string }) => Promise<AuthResult<{ status: boolean }>>;
  revokeOtherSessions: () => Promise<AuthResult<{ status: boolean }>>;
  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions?: boolean;
  }) => Promise<AuthResult<{ status: boolean }>>;
  requestPasswordReset: (body: {
    email: string;
    redirectTo: string;
  }) => Promise<AuthResult<{ status: boolean; message: string }>>;
  deleteUser: (body: {
    password?: string;
    callbackURL?: string;
  }) => Promise<AuthResult<{ success: boolean; message: string }>>;
  linkSocial: (body: {
    provider: OAuthProvider;
    callbackURL: string;
    errorCallbackURL: string;
    disableRedirect: boolean;
  }) => Promise<AuthResult<{ url?: string; redirect?: boolean }>>;
};

const securityClient = authClient as SecurityAuthClient;

export async function listSecurityState() {
  const [accountsResult, sessionsResult] = await Promise.all([
    securityClient.listAccounts(),
    securityClient.listSessions(),
  ]);

  return {
    accounts: readAuthData(accountsResult),
    sessions: readAuthData(sessionsResult),
  };
}

export async function changeAccountPassword(args: {
  currentPassword: string;
  newPassword: string;
}) {
  readAuthData(
    await securityClient.changePassword({
      currentPassword: args.currentPassword,
      newPassword: args.newPassword,
      revokeOtherSessions: true,
    }),
  );
}

export async function requestAccountPasswordReset(args: {
  email: string;
  redirectTo: string;
}) {
  readAuthData(await securityClient.requestPasswordReset(args));
}

export async function linkOAuthProvider(args: {
  provider: OAuthProvider;
  callbackURL: string;
  errorCallbackURL: string;
}) {
  return readAuthData(
    await securityClient.linkSocial({
      ...args,
      disableRedirect: true,
    }),
  );
}

export async function revokeAccountSession(token: string) {
  readAuthData(await securityClient.revokeSession({ token }));
}

export async function revokeOtherAccountSessions() {
  readAuthData(await securityClient.revokeOtherSessions());
}

export async function deleteCurrentAccount(args: {
  password?: string;
  callbackURL: string;
}) {
  return readAuthData(await securityClient.deleteUser(args));
}

export function readableAuthError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readAuthData<T>(result: AuthResult<T> | T): T {
  if (isAuthResult(result)) {
    if (result.error) {
      throw new Error(result.error.message ?? "Auth request failed.");
    }
    return result.data as T;
  }
  return result;
}

function isAuthResult<T>(result: AuthResult<T> | T): result is AuthResult<T> {
  return typeof result === "object" && result !== null && ("data" in result || "error" in result);
}
