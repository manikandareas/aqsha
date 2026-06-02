import { redirect } from "next/navigation";
import { SettingsShell } from "@/features/settings/components/settings-shell";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SettingsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <SettingsShell>{children}</SettingsShell>;
}
