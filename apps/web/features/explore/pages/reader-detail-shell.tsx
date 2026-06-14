"use client";

import type { ReactNode } from "react";
import { ExploreChatShell } from "./explore-chat-shell";

// Single-column reader scaffolding shared by the news + fact detail pages.
// Reuses the same chrome as the paper detail page (ExploreChatShell, including
// the global chat side panel) but a centered, sidebar-less column matching the
// Perplexity-style reader. `chatSeed` pre-fills the chat composer with the item
// currently being read.
export function ReaderDetailShell({
  breadcrumbLabel,
  chatSeed,
  children,
}: {
  breadcrumbLabel: string;
  chatSeed?: string;
  children: ReactNode;
}) {
  return (
    <ExploreChatShell
      breadcrumbs={[
        { label: "Jelajahi", href: "/app/explore" },
        { label: breadcrumbLabel },
      ]}
      chatSeed={chatSeed}
    >
      <div className="mx-auto w-full max-w-[760px] px-5 pb-16 pt-4 sm:px-8">
        {children}
      </div>
    </ExploreChatShell>
  );
}
