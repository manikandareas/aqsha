import "server-only";

import { headers } from "next/headers";
import { getApiBaseUrl } from "@/lib/api-url";

export type BetterAuthSession = {
  session: {
    id: string;
    token: string;
    userId: string;
    expiresAt: string | Date;
    createdAt: string | Date;
    updatedAt: string | Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
  user: {
    id: string;
    email: string;
    emailVerified: boolean;
    name: string;
    image?: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
    onboardingCompletedAt?: string | Date | null;
  };
};

export async function getServerSession(): Promise<BetterAuthSession | null> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie");

  if (!cookie) {
    return null;
  }

  const response = await fetch(`${getApiBaseUrl()}/api/auth/get-session`, {
    cache: "no-store",
    headers: {
      cookie,
    },
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as BetterAuthSession | null;
}
