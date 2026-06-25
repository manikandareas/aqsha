"use client";

import type { ReactNode } from "react";

// Full-viewport, card-less canvas: the page background only, content centered.
export function OnboardingLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh w-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl">{children}</div>
    </main>
  );
}
