import { redirect } from "next/navigation";
import { SourceLibrary } from "@/components/source-library";
import { isAuthenticated } from "@/lib/auth-server";

export default async function SourcesPage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <SourceLibrary />;
}
