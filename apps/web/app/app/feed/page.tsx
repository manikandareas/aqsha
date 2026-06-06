import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { FeedPage } from "@/features/feed/pages/feed-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Feed",
  description:
    "Berita sains hangat, klaim ditimbang bukti, dan celah riset — temukan ide untuk dikaji di Aqsha Feed.",
});

export default async function FeedRoute() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <FeedPage />;
}
