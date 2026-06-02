import { SettingsAccountPage } from "@/features/settings/pages/account-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Akun",
  description: "Kelola profil dan identitas yang dipakai di Aqsha.",
});

export default function AccountPage() {
  return <SettingsAccountPage />;
}
