import { redirect } from "next/navigation";
import { ThreadShell } from "@/components/thread-shell";
import { isAuthenticated } from "@/lib/auth-server";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { threadId } = await params;

  return <ThreadShell threadId={threadId} />;
}
