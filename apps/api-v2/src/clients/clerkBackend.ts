import { AppError } from "@aqsha/db";
import { createClerkClient } from "@clerk/backend";

/**
 * Clerk backend client (CLERK_SECRET_KEY) — dipakai worker account-deletion untuk
 * menghapus user di Clerk. Lazy singleton. `@aqsha/services` sengaja Clerk-free →
 * `AccountDeletionService.run` menerima `deleteClerkUser` sebagai dep dari sini.
 */
let client: ReturnType<typeof createClerkClient> | null = null;

function getClerk(): ReturnType<typeof createClerkClient> {
  if (client) return client;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required to delete Clerk users");
  client = createClerkClient({ secretKey });
  return client;
}

/** Hapus user Clerk; 404 (sudah hilang) = sukses (idempoten saat retry/webhook). */
export async function deleteClerkUser(clerkUserId: string): Promise<void> {
  try {
    await getClerk().users.deleteUser(clerkUserId);
  } catch (err) {
    if (typeof err === "object" && err !== null && (err as { status?: number }).status === 404) {
      return;
    }
    throw err;
  }
}

/** Sesi aktif ramping untuk panel "Perangkat aktif" (DTO, bukan resource Clerk penuh). */
export type ActiveSession = {
  id: string;
  browser: string | null;
  device: string | null;
  isMobile: boolean;
  ipAddress: string | null;
  city: string | null;
  country: string | null;
  lastActiveAt: number;
};

/** Daftar sesi aktif milik user (dari `latestActivity`). Hanya status active. */
export async function listUserSessions(clerkUserId: string): Promise<ActiveSession[]> {
  const { data } = await getClerk().sessions.getSessionList({
    userId: clerkUserId,
    status: "active",
  });
  return data.map((s) => {
    const a = s.latestActivity;
    return {
      id: s.id,
      browser: a?.browserName
        ? [a.browserName, a.browserVersion].filter(Boolean).join(" ")
        : null,
      device: a?.deviceType ?? null,
      isMobile: a?.isMobile ?? false,
      ipAddress: a?.ipAddress ?? null,
      city: a?.city ?? null,
      country: a?.country ?? null,
      lastActiveAt: s.lastActiveAt,
    };
  });
}

/**
 * Cabut (sign-out) satu sesi milik user. Ownership guard: sessionId WAJIB ada di
 * daftar sesi user — `getSessionList` sudah scoped per-user, jadi sesi user lain
 * tak akan cocok → 404 (cegah cabut sesi orang lain via id tebakan).
 */
export async function revokeUserSession(args: {
  clerkUserId: string;
  sessionId: string;
}): Promise<void> {
  const { data } = await getClerk().sessions.getSessionList({
    userId: args.clerkUserId,
    status: "active",
  });
  if (!data.some((s) => s.id === args.sessionId)) {
    throw new AppError({ message: "Sesi tidak ditemukan.", code: "session_not_found", status: 404 });
  }
  await getClerk().sessions.revokeSession(args.sessionId);
}
