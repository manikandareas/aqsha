import { beforeEach, describe, expect, mock, test } from "bun:test";

// Clerk butuh secret key untuk membangun client (lazy singleton di clerkBackend).
process.env.CLERK_SECRET_KEY = "sk_test_dummy";

// Sesi milik user "user_a". Sesi user lain TAK akan muncul di sini (getSessionList scoped per-user).
const SESSIONS = [
  {
    id: "sess_1",
    status: "active",
    lastActiveAt: 1_700_000_000_000,
    latestActivity: {
      browserName: "Chrome",
      browserVersion: "120",
      deviceType: "desktop",
      isMobile: false,
      ipAddress: "1.2.3.4",
      city: "Jakarta",
      country: "ID",
    },
  },
  { id: "sess_2", status: "active", lastActiveAt: 1_700_000_100_000, latestActivity: undefined },
];

const revoked: string[] = [];

// mock.module bersifat GLOBAL utk seluruh proses `bun test` → sediakan SEMUA named
// export `@clerk/backend` yang dipakai modul lain (clerkToken.ts impor `verifyToken`),
// kalau tidak importnya gagal "Export not found" saat suite lain ikut dijalankan.
mock.module("@clerk/backend", () => ({
  verifyToken: async () => null,
  createClerkClient: () => ({
    sessions: {
      getSessionList: async () => ({ data: SESSIONS, totalCount: SESSIONS.length }),
      revokeSession: async (id: string) => {
        revoked.push(id);
        return {};
      },
    },
  }),
}));

const { listUserSessions, revokeUserSession } = await import("../src/clients/clerkBackend");

beforeEach(() => {
  revoked.length = 0;
});

describe("clerkBackend sessions — ownership guard", () => {
  test("listUserSessions memetakan latestActivity → DTO ramping", async () => {
    const out = await listUserSessions("user_a");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      id: "sess_1",
      browser: "Chrome 120",
      device: "desktop",
      city: "Jakarta",
      country: "ID",
    });
    // Sesi tanpa latestActivity → field null, tidak crash.
    expect(out[1]).toMatchObject({ id: "sess_2", browser: null, device: null, isMobile: false });
  });

  test("revokeUserSession mencabut sesi milik user", async () => {
    await revokeUserSession({ clerkUserId: "user_a", sessionId: "sess_1" });
    expect(revoked).toEqual(["sess_1"]);
  });

  test("revokeUserSession menolak sesi yang bukan milik user → 404, tak mencabut", async () => {
    await expect(
      revokeUserSession({ clerkUserId: "user_a", sessionId: "sess_other_user" }),
    ).rejects.toMatchObject({ code: "session_not_found", status: 404 });
    expect(revoked).toEqual([]);
  });
});
