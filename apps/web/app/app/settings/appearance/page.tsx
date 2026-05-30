import { SettingsAppearancePage } from "@/features/settings/pages/appearance-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Tampilan",
  description: "Atur tema terang, gelap, atau mengikuti sistem di Aqsha.",
});

export default function AppearancePage() {
  return <SettingsAppearancePage />;
}
