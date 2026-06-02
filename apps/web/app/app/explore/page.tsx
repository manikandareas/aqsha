import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { ExplorePage } from "@/features/explore/pages/explore-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Explore",
  description: "Discover research papers and start focused inquiry threads from Aqsha Explore.",
});

export default async function ExploreRoute() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <ExplorePage />;
}
