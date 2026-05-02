"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NavJournal } from "@/components/nav-journal";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavThreads } from "@/components/nav-threads";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { BookUpIcon, MessageCircleQuestionIcon } from "lucide-react";

const data = {
  navMain: [
    {
      title: "Research Thread",
      url: "/app",
      icon: <MessageCircleQuestionIcon />,
    },
    {
      title: "Journals",
      url: "/app/journals",
      icon: <BookUpIcon />,
    },
  ],
  navSecondary: [],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const isJournalsRoute = pathname.startsWith("/app/journals");

  const navMain = data.navMain.map((item) => ({
    ...item,
    isActive:
      item.url === "/app"
        ? pathname === "/app" || pathname.startsWith("/app/threads/")
        : pathname === item.url || pathname.startsWith(`${item.url}/`),
  }));

  return (
    <Sidebar
      className={cn(
        "border-transparent bg-sidebar [--sidebar:var(--background)]",
        "[--sidebar-width:17.5rem]",
      )}
      {...props}
    >
      <SidebarHeader className="gap-4 px-3 pb-3 pt-4">
        <Link
          href="/app"
          aria-label="Go to Aqsha home"
          className={cn(
            "group/brand flex min-w-0 items-center gap-3 rounded-[14px] px-2 py-1.5",
            "transition-colors hover:bg-sidebar-accent/45",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          )}
        >
          <Image
            src="/icon0.svg"
            alt="Aqsha logo"
            width={32}
            height={32}
            className="size-7 rounded-[8px] shadow-[0_6px_16px_-10px_rgba(26,31,43,0.45)]"
            priority
          />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold leading-5 text-sidebar-foreground">
              Aqsha
            </span>
            <span className="block truncate text-[11px] font-medium leading-4 text-sidebar-foreground/50">
              Writing workspace
            </span>
          </span>
        </Link>

        <NavMain items={navMain} />
      </SidebarHeader>

      <SidebarContent className="gap-2 px-2 pb-4 pt-1">
        {isJournalsRoute ? <NavJournal /> : <NavThreads />}
        <NavSecondary items={data.navSecondary} className="mt-auto px-1 pt-1" />
      </SidebarContent>
    </Sidebar>
  );
}
