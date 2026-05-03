"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { NavJournal } from "@/components/nav-journal";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavThreads, NewResearchButton } from "@/components/nav-threads";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
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
      collapsible="icon"
      className={cn("border-sidebar-border bg-sidebar")}
      {...props}
    >
      <SidebarHeader className="gap-2.5 px-3 pb-2.5 pt-3">
        <div className="flex min-w-0 items-center pb-1">
          <Link
            href="/app"
            aria-label="Go to Aqsha home"
            className={cn(
              "group/brand flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5",
              "transition-colors hover:bg-sidebar-accent/45",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
              "group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sidebar-accent/45">
              <Image
                src="/icon0.svg"
                alt="Aqsha logo"
                width={32}
                height={32}
                className="size-6 rounded-[7px]"
                priority
              />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-[15px] font-bold leading-5 text-sidebar-foreground">
                Aqsha
              </span>
              <span className="block truncate text-[11px] font-medium leading-4 text-sidebar-foreground/55">
                Research Workspace
              </span>
            </span>
          </Link>
        </div>

        <NewResearchButton />
        <NavMain items={navMain} />
      </SidebarHeader>

      <SidebarContent className="gap-1.5 px-2 pb-2 pt-0">
        {isJournalsRoute ? <NavJournal /> : <NavThreads />}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-3 pt-2">
        <NavSecondary items={data.navSecondary} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
