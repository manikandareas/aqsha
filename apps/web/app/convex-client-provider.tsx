"use client";
"use no memo";

import { useAuth } from "@clerk/nextjs";
import { ConvexQueryClient } from "@convex-dev/react-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "@aqsha/convex/api";
import {
  useConvexAuth,
  useConvexMutationState,
} from "@/lib/convex-query";

export function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  "use no memo";

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const [clients] = useState(() => {
    if (!convexUrl) return null;

    const convex = new ConvexReactClient(convexUrl);
    const convexQueryClient = new ConvexQueryClient(convex);
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          gcTime: 30_000,
          queryFn: convexQueryClient.queryFn(),
          queryKeyHashFn: convexQueryClient.hashFn(),
        },
      },
    });
    convexQueryClient.connect(queryClient);

    return { convex, queryClient };
  });

  if (!clients) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <section className="mx-auto grid max-w-3xl gap-3 rounded-[18px] border bg-card p-6 shadow-aqsha">
          <h1 className="font-heading text-2xl font-bold">
            Convex environment is missing
          </h1>
          <p className="text-muted-foreground">
            Set NEXT_PUBLIC_CONVEX_URL and NEXT_PUBLIC_CONVEX_SITE_URL in
            apps/web/.env.local after linking packages/convex with Convex Cloud.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ConvexProviderWithClerk client={clients.convex} useAuth={useAuth}>
      <QueryClientProvider client={clients.queryClient}>
        <AuthenticatedUserSync>{children}</AuthenticatedUserSync>
      </QueryClientProvider>
    </ConvexProviderWithClerk>
  );
}

function AuthenticatedUserSync({ children }: { children: ReactNode }) {
  const { isAuthenticated: isConvexAuthenticated, isLoading: isConvexLoading } =
    useConvexAuth();
  const { isLoaded: isClerkLoaded, isSignedIn, userId } = useAuth();
  const syncCurrentUser = useConvexMutationState(api.auth.syncCurrentUser);
  const syncCurrentUserAsync = syncCurrentUser.mutateAsync;
  const syncedUserId = useRef<string | null>(null);
  const syncingUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!isClerkLoaded || !isSignedIn || !userId) {
      syncedUserId.current = null;
      syncingUserId.current = null;
      return;
    }
    if (isConvexLoading || !isConvexAuthenticated) return;
    if (syncedUserId.current === userId || syncingUserId.current === userId) return;

    syncingUserId.current = userId;
    void syncCurrentUserAsync({})
      .then(() => {
        syncedUserId.current = userId;
      })
      .catch(() => {
        console.error("Failed to sync Clerk user into Convex.");
      })
      .finally(() => {
        if (syncingUserId.current === userId) {
          syncingUserId.current = null;
        }
      });
  }, [
    isClerkLoaded,
    isConvexAuthenticated,
    isConvexLoading,
    isSignedIn,
    syncCurrentUserAsync,
    userId,
  ]);

  return <>{children}</>;
}
