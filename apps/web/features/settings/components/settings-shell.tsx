"use client";

import type { CSSProperties, ReactNode } from "react";
import { api } from "@aqsha/convex/api";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useConvexAuth, useConvexQueryData } from "@/lib/convex-query";
import { SettingsRail } from "./settings-rail";

export function SettingsShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useConvexQueryData(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "16.5rem",
          "--sidebar-width-mobile": "17.5rem",
        } as CSSProperties
      }
    >
      <SettingsRail viewer={viewer} />
      <SidebarInset className="min-h-svh bg-background text-foreground">
        <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid gap-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
