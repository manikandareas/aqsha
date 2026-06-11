import { redirect } from "next/navigation";
import { FactDetailPage } from "@/features/explore/pages/fact-detail-page";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Cek fakta",
  description: "Telaah verdict, bukti, dan paper pendukung di balik sebuah klaim.",
});

export default async function ExploreFactRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { id } = await params;

  return <FactDetailPage feedItemId={id} />;
}
