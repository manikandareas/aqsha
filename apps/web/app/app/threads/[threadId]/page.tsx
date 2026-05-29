import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth-server";
import { ThreadDetailShell } from "@/features/thread-experience/components/thread-detail-shell";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  if (!(await isAuthenticated())) {
    redirect("/sign-in");
  }

  const { threadId } = await params;

  return <ThreadDetailShell threadId={threadId} />;
}
