"use client";

import { AlignLeftIcon, PanelRightIcon } from "lucide-react";
import type { UIMessage } from "ai";
import { useState, useSyncExternalStore } from "react";

import { AppPageHeader } from "@/components/app-page-header";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { ChatThread } from "@/features/chat/components/chat-thread";
import { ThreadSourcesPanel } from "@/features/chat/components/thread-sources-panel";
import type {
  AgentEvent,
  AgentRun,
  ChatMessage,
  ChatSource,
} from "@/features/chat/lib/types";
import { cn } from "@/lib/utils";

const DESKTOP_QUERY = "(min-width: 1024px)";

function subscribeToDesktopQuery(callback: () => void) {
  const mediaQuery = window.matchMedia(DESKTOP_QUERY);

  mediaQuery.addEventListener("change", callback);

  return () => mediaQuery.removeEventListener("change", callback);
}

function getDesktopSnapshot() {
  return window.matchMedia(DESKTOP_QUERY).matches;
}

function getServerDesktopSnapshot() {
  return false;
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeToDesktopQuery,
    getDesktopSnapshot,
    getServerDesktopSnapshot,
  );
}

export function ThreadPageShell({
  id,
  initialEvents,
  initialLatestRun,
  initialMessages,
  initialSources,
  title,
}: {
  id: string;
  initialEvents: AgentEvent[];
  initialLatestRun: AgentRun | null;
  initialMessages: ChatMessage[];
  initialSources: ChatSource[];
  title: string;
}) {
  const isDesktop = useIsDesktop();
  const [displayMessages, setDisplayMessages] =
    useState<UIMessage[]>(initialMessages);
  const [desktopSourcesOpen, setDesktopSourcesOpen] = useState(true);
  const [mobileSourcesOpen, setMobileSourcesOpen] = useState(false);

  const trigger = (
    <>
      <Button
        aria-controls="thread-sources-sidebar"
        aria-expanded={desktopSourcesOpen}
        className="hidden lg:inline-flex"
        onClick={() => setDesktopSourcesOpen((open) => !open)}
        size="sm"
        type="button"
        variant="outline"
      >
        <PanelRightIcon data-icon="inline-start" />
        <span>sources</span>
      </Button>
      <Button
        aria-expanded={mobileSourcesOpen}
        className="lg:hidden"
        onClick={() => setMobileSourcesOpen(true)}
        type="button"
        variant="ghost"
      >
        <AlignLeftIcon className="size-4 shrink-0 text-muted-foreground" />
        <span>Sources</span>
      </Button>
    </>
  );

  return (
    <div className="grid h-full min-h-0 overflow-hidden bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_auto]">
      <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <AppPageHeader actions={trigger} title={title} />

        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <ChatThread
            id={id}
            initialEvents={initialEvents}
            initialLatestRun={initialLatestRun}
            initialMessages={initialMessages}
            onMessagesChange={setDisplayMessages}
          />
        </main>
      </div>

      <aside
        className={cn(
          "hidden h-full min-h-0 overflow-hidden transition-[width,opacity] duration-200 lg:flex",
          desktopSourcesOpen ? "w-[30rem] opacity-100" : "w-0 opacity-0",
        )}
        id="thread-sources-sidebar"
      >
        <ThreadSourcesPanel
          events={initialEvents}
          messages={displayMessages}
          sources={initialSources}
        />
      </aside>

      <Drawer
        direction="right"
        open={mobileSourcesOpen && !isDesktop}
        onOpenChange={setMobileSourcesOpen}
      >
        <DrawerContent className="lg:hidden sm:max-w-md">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Sources</DrawerTitle>
            <DrawerDescription>
              Sources cited in the current thread.
            </DrawerDescription>
          </DrawerHeader>
          <ThreadSourcesPanel
            events={initialEvents}
            messages={displayMessages}
            sources={initialSources}
          />
        </DrawerContent>
      </Drawer>
    </div>
  );
}
