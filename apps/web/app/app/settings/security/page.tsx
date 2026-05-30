import { SettingsSecurityPage } from "@/features/settings/pages/security-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Keamanan",
  description: "Kelola sesi aktif dan akses perangkat untuk akun Aqsha.",
});

export default function SecurityPage() {
  return <SettingsSecurityPage />;
}
