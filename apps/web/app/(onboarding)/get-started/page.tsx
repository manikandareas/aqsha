import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-auth";
import { GetStartedForm } from "@/features/onboarding/components/get-started-form";

export default async function GetStartedPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/signin");
  }

  if (session.user.onboardingCompletedAt) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="max-w-2xl">
          <div className="mb-8 inline-flex rounded-full bg-badge-bg px-3 py-1 text-badge font-semibold tracking-badge text-badge-foreground">
            Aqsha Workspace
          </div>
          <h1 className="max-w-xl text-[clamp(2.5rem,5vw,4rem)] font-bold leading-none tracking-display text-foreground">
            Welcome to Aqsha, {session.user.name}
          </h1>
          <p className="mt-5 max-w-lg text-body-lg font-medium leading-8 tracking-body-lg text-muted-foreground">
            Name your workspace and Aqsha will prepare a focused writing
            environment for your journals, research, and drafts.
          </p>
        </section>

        <section className="w-full lg:justify-self-end">
          <GetStartedForm />
        </section>
      </div>
    </main>
  );
}
