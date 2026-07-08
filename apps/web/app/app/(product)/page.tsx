import { ThreadShell } from "@/components/thread-shell";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Threads",
  description: "Continue research conversations and manage active inquiry threads in Aqsha.",
});

export default function HomePage() {
  return <ThreadShell />;
}
