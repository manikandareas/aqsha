import type { ReactNode } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createServerApiClient } from "@/lib/server-eden";

type AppLayoutProps = {
  children: ReactNode;
};

export default async function AppLayout({ children }: AppLayoutProps) {
  const api = await createServerApiClient();
  const bootstrap = await api.session.bootstrap.get();
  const bootstrapData = bootstrap.error ? null : bootstrap.data;

  return (
    <SidebarProvider>
      <AppSidebar bootstrap={bootstrapData} />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
