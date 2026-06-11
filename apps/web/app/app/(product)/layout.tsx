import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";

// Shared shell for the product surfaces (threads, workspaces, explore). Settings
// lives outside this route group and keeps its own SettingsRail, so the global
// AppSidebar is scoped here and never double-renders. Reading the sidebar cookie
// on the server lets us pass the correct initial open/closed state and avoid a
// hydration flash of the sidebar (shadcn pattern).
export default async function ProductLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const defaultSidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <AppShell defaultSidebarOpen={defaultSidebarOpen}>{children}</AppShell>;
}
