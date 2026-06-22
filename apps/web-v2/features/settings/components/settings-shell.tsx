"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useProfile } from "@/features/settings/api";
import { SettingsRail } from "./settings-rail";

export function SettingsShell({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const viewer = profile.data
    ? {
        id: profile.data.id,
        name: profile.data.name,
        email: profile.data.email,
        emailVerified: profile.data.emailVerified ?? false,
        image: profile.data.image,
      }
    : undefined;

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
