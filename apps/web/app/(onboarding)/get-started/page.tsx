import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-auth";
import { GetStartedForm } from "@/features/onboarding/components/get-started-form";

function ProductPreview() {
  const leftLines = ["w-24", "w-16", "w-28", "w-20", "w-24", "w-16"];
  const bodyLines = ["w-20", "w-48", "w-72", "w-80", "w-64"];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 right-0 hidden w-[52vw] overflow-hidden lg:block"
    >
      <div className="absolute -right-20 -top-44 h-[36rem] w-40 rotate-[-9deg] rounded-full border-[28px] border-notion-orange/90 opacity-90 blur-[0.2px]" />
      <div className="absolute -bottom-56 right-2 h-[46rem] w-44 rotate-[28deg] rounded-full border-[32px] border-notion-orange/85 opacity-90 blur-[0.2px]" />
      <div className="absolute -bottom-40 right-72 h-[34rem] w-32 rotate-[34deg] rounded-full border-[24px] border-notion-orange/80 opacity-80 blur-[0.2px]" />

      <div className="absolute right-[-19rem] top-1/2 w-[58rem] -translate-y-1/2 rounded-2xl border border-border/80 bg-card/88 p-4 shadow-deep-card backdrop-blur-md dark:bg-card/82">
        <div className="h-[31rem] rounded-xl border border-border/70 bg-background/95 p-8 shadow-soft-card">
          <div className="mb-7 flex items-center gap-5">
            <div className="flex items-center gap-3">
              <div className="grid size-7 place-items-center">
                <div className="h-7 w-5 -skew-x-[28deg] bg-foreground" />
              </div>
              <div className="text-card-title font-bold tracking-card-title">
                Org Docs
              </div>
            </div>
            <div className="ml-auto h-9 w-64 rounded-full border border-border bg-card shadow-soft-card">
              <div className="ml-5 mt-2.5 size-3 rounded-full border border-muted-foreground/45" />
            </div>
            <div className="h-9 w-24 rounded-full border border-border bg-card shadow-soft-card" />
          </div>

          <div className="mb-6 flex gap-7">
            <div>
              <div className="h-2.5 w-24 rounded-full bg-notion-orange" />
              <div className="mx-auto mt-3 h-0.5 w-24 rounded-full bg-notion-orange" />
            </div>
            <div className="h-2 w-20 rounded-full bg-muted" />
            <div className="h-2 w-20 rounded-full bg-muted" />
            <div className="h-2 w-24 rounded-full bg-muted" />
          </div>

          <div className="grid grid-cols-[13rem_1fr] gap-9">
            <aside className="space-y-5">
              <div className="rounded-sm bg-notion-orange/12 px-5 py-2.5">
                <div className="h-2.5 w-28 rounded-full bg-notion-orange" />
              </div>
              <div className="space-y-3 px-5">
                {leftLines.map((width, index) => (
                  <div
                    key={`${width}-${index}`}
                    className={`h-2 rounded-full bg-muted ${width}`}
                  />
                ))}
              </div>
              <div className="space-y-3 px-5 pt-12">
                <div className="h-2 w-28 rounded-full bg-muted" />
                <div className="h-2 w-20 rounded-full bg-muted" />
              </div>
            </aside>

            <section>
              <div className="mb-10 h-36 rounded-sm bg-muted/55" />
              <div className="mb-7 ml-28 h-2.5 w-28 rounded-full bg-notion-orange" />
              <div className="space-y-4">
                {bodyLines.map((width, index) => (
                  <div
                    key={`${width}-${index}`}
                    className={`h-2.5 rounded-full bg-muted ${width}`}
                  />
                ))}
              </div>
              <div className="mt-12 grid grid-cols-2 gap-8">
                <div className="h-28 rounded-sm bg-muted/55 p-6">
                  <div className="size-4 rounded-full bg-notion-orange" />
                </div>
                <div className="h-28 rounded-sm bg-muted/55 p-6">
                  <div className="size-4 rounded-full bg-notion-orange" />
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
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
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <ProductPreview />

      <div className="relative z-10 flex min-h-screen w-full items-center px-5 py-10 sm:px-8 lg:px-0">
        <section className="mx-auto w-full max-w-[35rem] lg:ml-[9vw] lg:mr-0 lg:mt-16">
          <h1 className="max-w-xl text-[2.5rem] font-bold leading-[1.08] tracking-h1 sm:text-h1">
            <span className="block text-muted-foreground">
              Set up your organization.
            </span>
            <span className="block text-foreground">Your docs live here.</span>
          </h1>

          <div className="mt-12">
            <GetStartedForm />
          </div>
        </section>
      </div>
    </main>
  );
}
