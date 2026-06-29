"use client";

// Shell chat untuk halaman baca Explore (paper & berita). Membungkus reader dengan panel
// chat Astra (DetailSplitLayout + ExploreChatSidePanel, workspace-less) — cermin ExplorePage.
// Token konteks halaman (paper/berita) dialirkan ke composer lewat ComposerMentionsProvider
// (`ambientContextRefs`) sehingga otomatis tersemat sebagai pill saat panel dibuka. Tombol
// "Tanya Astra" di reader memanggil `openChat` (render-prop) → buka panel, BUKAN navigasi seed.

import type { ContextRef } from "@aqsha/chat-core";
import { ChevronRightIcon, MessageSquareIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { DetailSplitLayout } from "@/components/layout/detail-split-layout";
import { ResponsiveSidePanel } from "@/components/layout/responsive-side-panel";
import { ComposerMentionsProvider } from "@/features/thread-experience/components/composer-context-mentions";
import { panelHeaderBarClass } from "@/lib/panel-surface";
import { cn } from "@/lib/utils";
import { ExploreChatSidePanel } from "@/features/explore/components/explore-chat-side-panel";

export function ExploreReaderChatShell({
  breadcrumb,
  ambientContextRefs,
  children,
}: {
  /** Label segmen terakhir breadcrumb (mis. "Paper" / "Berita"). */
  breadcrumb: string;
  ambientContextRefs: ContextRef[];
  children: (args: { openChat: () => void }) => ReactNode;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const handleThreadChange = (next: string | null) => {
    setThreadId(next);
    if (next !== null) setChatOpen(true);
  };

  return (
    <main className="flex h-svh min-h-0 flex-col overflow-hidden bg-background">
      <ComposerMentionsProvider
        threadId={threadId ?? undefined}
        ambientContextRefs={ambientContextRefs}
      >
        <DetailSplitLayout
          sideOpen={chatOpen}
          onSideOpenChange={setChatOpen}
          main={
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ReaderHeader
                breadcrumb={breadcrumb}
                chatOpen={chatOpen}
                onToggleChat={() => setChatOpen((open) => !open)}
              />
              {children({ openChat: () => setChatOpen(true) })}
            </div>
          }
          side={
            <ResponsiveSidePanel open={chatOpen}>
              <ExploreChatSidePanel
                activeThreadId={threadId}
                onActiveThreadIdChange={handleThreadChange}
              />
            </ResponsiveSidePanel>
          }
        />
      </ComposerMentionsProvider>
    </main>
  );
}

function ReaderHeader({
  breadcrumb,
  chatOpen,
  onToggleChat,
}: {
  breadcrumb: string;
  chatOpen: boolean;
  onToggleChat: () => void;
}) {
  return (
    <header className={panelHeaderBarClass}>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Link
          href="/app/explore"
          className="shrink-0 truncate rounded-md font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Jelajahi
        </Link>
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" />
        <span className="min-w-0 truncate font-medium text-foreground">{breadcrumb}</span>
      </nav>
      <button
        type="button"
        onClick={onToggleChat}
        className={cn(
          "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
          chatOpen
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
        )}
      >
        <MessageSquareIcon className="size-3.5" />
        Chat
      </button>
    </header>
  );
}
