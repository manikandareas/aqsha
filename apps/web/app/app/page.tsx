import { redirect } from "next/navigation";
import { ThreadShell } from "@/components/thread-shell";
import { isAuthenticated } from "@/lib/auth-server";

export default async function HomePage() {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  return <ThreadShell />;
}
