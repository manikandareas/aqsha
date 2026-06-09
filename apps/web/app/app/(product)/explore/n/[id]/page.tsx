import { redirect } from "next/navigation";
import { NewsDetailPage } from "@/features/explore/pages/news-detail-page";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Berita",
  description: "Baca berita sains pilihan dengan sumber dan bacaan terkait.",
});

export default async function ExploreNewsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { id } = await params;

  return <NewsDetailPage feedItemId={id} />;
}
