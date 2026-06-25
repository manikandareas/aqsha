"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLoadingOverlay } from "@/components/app-loading-overlay";
import { useApi } from "@/lib/api-client";
import { queryKeys, unwrap } from "@/lib/api-query";

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const api = useApi();
  const status = useQuery({
    queryKey: queryKeys.onboarding.status(),
    queryFn: async () => unwrap(await api.onboarding.status.get()),
  });

  const needsOnboarding =
    pathname.startsWith("/app") &&
    !pathname.startsWith("/onboarding") &&
    status.data &&
    !status.data.completed;

  useEffect(() => {
    if (needsOnboarding) {
      router.replace("/onboarding");
    }
  }, [needsOnboarding, router]);

  if (pathname.startsWith("/app") && status.isLoading) {
    return <AppLoadingOverlay label="Menyiapkan akun..." />;
  }

  if (needsOnboarding) {
    return <AppLoadingOverlay label="Menyiapkan onboarding..." />;
  }

  return children;
}
