import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { WorkspacesIndexPage } from "@/features/workspaces/pages/workspaces-index-page";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Workspaces",
  description: "Browse, create, and organize research workspaces in Aqsha.",
});

export default async function WorkspacesPage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <WorkspacesIndexPage />;
}
