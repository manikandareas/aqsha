import { redirect } from "next/navigation";
import { ThreadShell } from "@/components/thread-shell";
import { isAuthenticated } from "@/lib/auth-server";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Threads",
  description: "Continue research conversations and manage active inquiry threads in Aqsha.",
});

export default async function HomePage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <ThreadShell />;
}
