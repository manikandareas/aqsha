import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { DiscoveryPage } from "@/features/discovery/pages/discovery-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Jelajahi",
  description: "Feed riset, paper, dan cek fakta dalam satu tempat — lalu mulai meneliti dalam satu klik.",
});

export default async function ExploreRoute() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <DiscoveryPage />;
}
