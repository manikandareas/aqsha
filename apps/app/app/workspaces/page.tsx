import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { WorkspacesIndexPage } from "@/features/workspaces/pages/workspaces-index-page";

export default async function WorkspacesPage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <WorkspacesIndexPage />;
}
