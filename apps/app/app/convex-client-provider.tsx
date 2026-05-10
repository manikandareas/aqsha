"use client";

import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { ConvexReactClient } from "convex/react";
import { type ReactNode, useMemo } from "react";
import { authClient } from "@/lib/auth-client";

export function ConvexClientProvider({
  children,
  initialToken,
}: {
  children: ReactNode;
  initialToken?: string | null;
}) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const convex = useMemo(
    () => (convexUrl ? new ConvexReactClient(convexUrl) : null),
    [convexUrl],
  );

  if (!convex) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <section className="mx-auto grid max-w-3xl gap-3 rounded-[18px] border bg-card p-6 shadow-aqsha">
          <h1 className="font-heading text-2xl font-bold">
            Convex environment is missing
          </h1>
          <p className="text-muted-foreground">
            Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL in
            apps/app/.env.local after linking packages/convex with Convex Cloud.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ConvexBetterAuthProvider
      client={convex}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  );
}
