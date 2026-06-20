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
  try {
    const api = await getServerApi();
    const { data } = await api.onboarding.status.get();
    if (data?.completed) {
      redirect("/app");
    }
  } catch (error) {
    console.error("Onboarding status check failed", error);
  }

  return <OnboardingWizard />;
}
