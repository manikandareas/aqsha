"use client";

import type { CSSProperties, ReactNode } from "react";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
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
        <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b border-border/60 bg-background/80 px-4 backdrop-blur md:hidden">
          <SidebarTrigger className="-ml-1.5 size-8 text-muted-foreground" />
          <span className="text-[13px] font-medium text-foreground">Pengaturan</span>
        </header>
        <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="grid gap-6">{children}</div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
