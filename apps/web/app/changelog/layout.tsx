import type { ReactNode } from "react";

import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";

// Changelog memakai chrome marketing (header + footer) supaya konsisten dgn
// landing & blog dan punya internal link ke seluruh situs — bagus untuk SEO.
export default function ChangelogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <LandingHeader />
      <div className="flex-1">{children}</div>
      <LandingFooter />
    </div>
  );
}
