import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getServerApi } from "@/lib/api-server";
import { OnboardingWizard } from "./onboarding-wizard";

export default async function OnboardingRoute() {
  const { isAuthenticated } = await auth();
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  // Bounce user yang sudah onboarding (server-side) supaya tak terjebak di wizard.
  // Fail-open: bila status gagal dibaca, tampilkan wizard alih-alih memblokir.
  // PENTING: redirect() melempar NEXT_REDIRECT; panggil DI LUAR try/catch supaya
  // tidak tertelan oleh catch (kalau di dalam, redirect gagal senyap).
  let completed = false;
  try {
    const api = await getServerApi();
    const { data } = await api.onboarding.status.get();
    completed = Boolean(data?.completed);
  } catch (error) {
    console.error("Onboarding status check failed", error);
  }

  if (completed) {
    redirect("/app");
  }

  return <OnboardingWizard />;
}
