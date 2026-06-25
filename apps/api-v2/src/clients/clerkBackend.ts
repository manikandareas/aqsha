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
