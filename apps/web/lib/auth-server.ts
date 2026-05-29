import { auth } from "@clerk/nextjs/server";

export async function isAuthenticated() {
  const session = await auth();
  return Boolean(session.userId);
}
