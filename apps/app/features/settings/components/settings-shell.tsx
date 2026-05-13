"use client";

import type { CSSProperties, ReactNode } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@aqsha/convex/api";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { SettingsRail } from "./settings-rail";

export function SettingsShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.auth.getCurrentUser, isAuthenticated ? {} : "skip");

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
        <main className="mx-auto grid w-full max-w-5xl gap-7 px-4 py-6 sm:px-8 lg:py-10">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
