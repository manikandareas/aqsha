import { redirect } from "next/navigation";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Settings",
  description: "Manage account, appearance, usage, billing, and security settings in Aqsha.",
});

export default function SettingsIndexPage() {
  redirect("/app/settings/overview");
}
