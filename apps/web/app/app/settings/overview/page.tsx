import { SettingsOverviewPage } from "@/features/settings/pages/overview-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Ringkasan",
  description: "Lihat rangkuman akun dan aktivitas riset Aqsha.",
});

export default function OverviewPage() {
  return <SettingsOverviewPage />;
}
