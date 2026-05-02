import Image from "next/image";
import { redirect } from "next/navigation";

import { GetStartedForm } from "@/features/onboarding/components/get-started-form";
import { getServerSession } from "@/lib/server-auth";

function AqshaMark() {
  return (
    <div className="flex items-center gap-2" aria-label="Aqsha">
      <div className="relative size-8">
        <span className="absolute left-0 top-0 size-4 rounded-sm bg-notion-warm-dark" />
        <span className="absolute right-0 top-1 size-4 rounded-sm bg-notion-orange" />
        <span className="absolute bottom-0 left-2 size-4 rounded-sm bg-notion-gray-300" />
      </div>
      <span className="text-nav font-bold tracking-tight text-foreground">
        Aqsha
      </span>
    </div>
  );
}

function ProductPreview() {
  return (
    <section
      className="hidden h-screen items-center justify-end overflow-hidden py-16 pl-12 lg:flex"
      aria-hidden="true"
    >
      <Image
        src="/assets/nested-screens.png"
        alt=""
        width={920}
        height={720}
        priority
        className="mr-[-7%] w-[min(96%,920px)] object-contain"
      />
    </section>
  );
}

export default async function GetStartedPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/signin");
  }

  // if (session.user.onboardingCompletedAt) {
  //   redirect("/");
  // }

  return (
    <main className="grid h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
      <section className="flex h-screen items-center justify-center overflow-hidden px-6 py-12 sm:px-8 lg:px-12">
        <div className="w-full max-w-[390px]">
          <AqshaMark />

          <div className="mt-10 space-y-3">
            <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground sm:text-[2.25rem]">
              Set up your research writing space.
            </h1>
            <p className="max-w-[20rem] text-sm font-normal leading-6 text-muted-foreground">
              Continue to your journals, research threads, and source-backed
              writing tools.
            </p>
          </div>

          <div className="mt-8">
            <GetStartedForm />
          </div>
        </div>
      </section>

      <ProductPreview />
    </main>
  );
}
