import type { ReactNode } from "react";
import { ThreadSidebar } from "@/features/threads/components/thread-sidebar";

/**
 * Shell chat Astra (Fase 6) — sidebar daftar percakapan + pane aktif. Auth/onboarding
 * sudah di-gate `/app/layout.tsx`. `/app/threads/spike` (debug 6.0) ikut shell ini.
 */
export default function ThreadsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh">
      <ThreadSidebar />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
