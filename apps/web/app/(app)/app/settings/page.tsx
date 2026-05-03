import { AppPageHeader } from "@/components/app-page-header";
import { SettingsContent } from "@/features/settings/components/settings-content";
import { getServerSession } from "@/lib/server-auth";

export default async function SettingsPage() {
  const session = await getServerSession();

  return (
    <>
      <AppPageHeader title="Settings" />
      <SettingsContent session={session} />
    </>
  );
}
