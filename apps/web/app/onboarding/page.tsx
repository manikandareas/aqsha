import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";
import { api } from "@aqsha/convex/api";
import { OnboardingPage } from "@/features/onboarding/pages/onboarding-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Selamat datang",
  description: "Sesuaikan Aqsha dengan minat dan latar belakangmu dalam satu menit.",
});

export default async function OnboardingRoute() {
  const { isAuthenticated, getToken } = await auth();
  if (!isAuthenticated) {
    redirect("/sign-in");
  }

  // Bounce already-onboarded users server-side so they never see the wizard.
  let completed = false;
  try {
    const token = await getToken({ template: "convex" });
    if (token) {
      const status = await fetchQuery(api.onboarding.getStatus, {}, { token });
      completed = status.completed;
    }
  } catch (error) {
    // Fail open: on a transient error, show onboarding rather than block.
    console.error("Onboarding route status check failed", error);
  }

  if (completed) {
    redirect("/app/explore");
  }

  return <OnboardingPage />;
}
