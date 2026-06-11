import { redirect } from "next/navigation";
import { ExploreDetailPage } from "@/features/explore/pages/explore-detail-page";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Paper",
  description: "Review a saved Explore paper with citations, metadata, and PDF access.",
});

export default async function ExplorePaperRoute({
  params,
}: {
  params: Promise<{ paperRef: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { paperRef } = await params;

  return <ExploreDetailPage paperRef={paperRef} />;
}
