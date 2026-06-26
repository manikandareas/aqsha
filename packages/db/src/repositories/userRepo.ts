import { eq } from "drizzle-orm";
import { type NewUser, type User, users } from "../schema/users";
import type { DbOrTx } from "../types";

/** Repo users — hanya query Drizzle (tanpa business rule). Terima `DbOrTx`. */
export const UserRepo = {
  async findByOwnerUserId(db: DbOrTx, ownerUserId: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.ownerUserId, ownerUserId)).limit(1);
    return rows[0] ?? null;
  },

  async findByClerkUserId(db: DbOrTx, clerkUserId: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.clerkUserId, clerkUserId)).limit(1);
    return rows[0] ?? null;
  },

  /** Atribusi webhook Mayar by-email. Index `users_by_email`. Ambil 1 (email seharusnya unik per akun). */
  async findByEmail(db: DbOrTx, email: string): Promise<User | null> {
    const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return rows[0] ?? null;
  },

  async insert(db: DbOrTx, row: NewUser): Promise<void> {
    await db.insert(users).values(row);
  },

  async patch(db: DbOrTx, ownerUserId: string, patch: Partial<NewUser>): Promise<void> {
    await db.update(users).set(patch).where(eq(users.ownerUserId, ownerUserId));
  },
};
