import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@aqsha/convex/api";

// Server-side onboarding gate for the whole authenticated product. Running here
// (not just in the client OnboardingGate) means a not-yet-onboarded user is
// redirected before any /app HTML is sent — no flash of the app shell, on both
// sign-up and sign-in. Convex is the single source of truth, so there's no
// Clerk-metadata mirroring or session-token refresh race: the moment
// `onboarding.complete` commits, this check returns completed=true.
//
// This layout is preserved across client-side navigations within /app, so the
// check effectively runs once per entry into the product, not per navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, getToken } = await auth();
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  let needsOnboarding = false;
  try {
    const token = await getToken({ template: "convex" });
    if (token) {
      const status = await fetchQuery(api.onboarding.getStatus, {}, { token });
      needsOnboarding = !status.completed;
    }
  } catch (error) {
    // Fail open: a transient Convex/token error must not lock authenticated
    // users out of the app. The client OnboardingGate remains as a safety net.
    console.error("Server onboarding gate check failed", error);
  }

  if (needsOnboarding) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
