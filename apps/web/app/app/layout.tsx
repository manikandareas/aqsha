import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getServerApi } from "@/lib/api-server";

/**
 * Server-gate `/app` (RSC). Redirect terjadi SEBELUM render → tanpa flash:
 * un-authed → /sign-in; un-onboarded → /onboarding. `/onboarding` ada di luar
 * subtree ini sehingga tidak ikut ter-gate (mencegah redirect loop).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  const api = await getServerApi();
  const { data } = await api.onboarding.status.get();
  if (!data?.completed) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
