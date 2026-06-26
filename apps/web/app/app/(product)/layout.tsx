import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell";

export default async function ProductLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const defaultSidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return <AppShell defaultSidebarOpen={defaultSidebarOpen}>{children}</AppShell>;
}
