import Link from "next/link";
import { createPageMetadata } from "@/lib/metadata";

import { Button } from "@/components/ui/button";

export const metadata = createPageMetadata({
  title: "Research workspace",
  description: "Aqsha helps researchers organize inquiry, threads, and workspace knowledge.",
});

export default function PublicLandingPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-6 py-16 text-foreground">
      <section className="mx-auto flex w-full max-w-3xl flex-col items-start gap-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Aqsha</p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Research workspace for focused inquiry.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            The product experience has moved to a protected `/app` route while
            the public landing page is prepared in a later migration phase.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/app">Open app</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
