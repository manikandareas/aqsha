import type { ReactNode } from "react";

import { LandingFooter } from "@/features/marketing/components/landing-footer";
import { LandingHeader } from "@/features/marketing/components/landing-header";

// Blog memakai chrome marketing (header + footer) supaya konsisten dgn landing
// dan punya internal link ke seluruh situs — bagus untuk SEO.
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <LandingHeader />
      <div className="flex-1">{children}</div>
      <LandingFooter />
    </div>
  );
}
