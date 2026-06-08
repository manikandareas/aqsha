"use client";

import { ArrowLeftIcon, BookOpenIcon } from "@aqsha/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

export function ReaderDetailState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <div>
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 mb-5 text-muted-foreground"
      >
        <Link href="/app/explore">
          <ArrowLeftIcon className="size-4" /> Jelajahi
        </Link>
      </Button>
      <div className="grid min-h-[48svh] place-items-center rounded-[8px] border border-border/80 bg-card/30 p-6 text-center">
        <div>
          <BookOpenIcon className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 max-w-md text-[14px] font-medium leading-6 text-muted-foreground">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ReaderDetailSkeleton() {
  return (
    <div>
      <Skeleton className="h-10 w-[85%] rounded-md bg-muted" />
      <Skeleton className="mt-3 h-10 w-[60%] rounded-md bg-muted" />
      <Skeleton className="mt-5 h-5 w-[70%] rounded-md bg-muted/70" />
      <Skeleton className="mt-2 h-5 w-[55%] rounded-md bg-muted/70" />
      <Skeleton className="mt-6 h-14 w-full rounded-[12px] bg-muted/60" />
      <Skeleton className="mt-6 aspect-[16/9] w-full rounded-[14px] bg-muted/60" />
      <Skeleton className="mt-6 h-5 w-full rounded-md bg-muted/50" />
      <Skeleton className="mt-2 h-5 w-[92%] rounded-md bg-muted/50" />
      <Skeleton className="mt-2 h-5 w-[80%] rounded-md bg-muted/50" />
    </div>
  );
}
