import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { ExplorePage } from "@/features/explore/pages/explore-page";

export default async function ExploreRoute() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <ExplorePage />;
}
