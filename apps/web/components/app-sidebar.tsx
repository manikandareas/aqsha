"use client";

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
import {
  BookUpIcon,
  HomeIcon,
  LibraryIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  Settings2Icon,
} from "lucide-react";

const data = {
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: <SearchIcon />,
      shortcut: "⌘K",
      variant: "search" as const,
    },
    {
      title: "Home",
      url: "/app",
      icon: <HomeIcon />,
    },
    {
      title: "Journals",
      url: "/app/journals",
      icon: <BookUpIcon />,
    },
    {
      title: "My Library",
      url: "/app/my-library",
      icon: <LibraryIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "/app/settings",
      icon: <Settings2Icon />,
    },
    {
      title: "Help",
      url: "#",
      icon: <MessageCircleQuestionIcon />,
    },
  ],
};

export function AppSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const isJournalsRoute = pathname.startsWith("/app/journals");
  const navMain = data.navMain.map((item) => ({
    ...item,
    isActive:
      item.url === "/app"
        ? pathname === "/app" || pathname.startsWith("/app/threads/")
        : pathname === item.url || pathname.startsWith(`${item.url}/`),
  }));
  const navSecondary = data.navSecondary.map((item) => ({
    ...item,
    isActive:
      item.url !== "#" &&
      (pathname === item.url || pathname.startsWith(`${item.url}/`)),
  }));

  return (
    <Sidebar
      className="border-0 border-transparent bg-background [--sidebar:var(--background)]"
      {...props}
    >
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Image
              src="/icon0.svg"
              alt=""
              width={32}
              height={32}
              className="size-8 shrink-0 rounded-md"
              priority
            />
            <div className="min-w-0">
              <div className="truncate text-[15px] font-semibold leading-5">
                Aqsha
              </div>
            </div>
          </div>
        </div>
        <div className="px-2 mt-2">
          <NavMain items={navMain} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isJournalsRoute ? <NavJournal /> : <NavThreads />}
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  );
}
