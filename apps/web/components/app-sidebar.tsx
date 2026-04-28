"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { NavJournal } from "@/components/nav-journal";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  AudioLinesIcon,
  BlocksIcon,
  HomeIcon,
  MessageCircleIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  Settings2Icon,
  SmileIcon,
  TerminalIcon,
} from "lucide-react";

// This is sample data.
const data = {
  teams: [
    {
      name: "Acme Inc",
      logo: <SmileIcon />,
      plan: "Enterprise",
      color: "bg-primary text-primary-foreground",
    },
    {
      name: "Acme Corp.",
      logo: <AudioLinesIcon />,
      plan: "Startup",
    },
    {
      name: "Evil Corp.",
      logo: <TerminalIcon />,
      plan: "Free",
    },
  ],
  navMain: [
    {
      title: "Search",
      url: "#",
      icon: <SearchIcon />,
      shortcut: "⌘K",
      variant: "search" as const,
    },
    {
      title: "Journal",
      url: "/app",
      icon: <HomeIcon />,
    },
    {
      title: "Threads",
      url: "/app/threads",
      icon: <MessageCircleIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: <Settings2Icon />,
    },
    {
      title: "Help",
      url: "#",
      icon: <MessageCircleQuestionIcon />,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const navMain = data.navMain.map((item) => ({
    ...item,
    isActive:
      item.url === "/app"
        ? pathname === "/app" || pathname.startsWith("/app/journal")
        : pathname.startsWith(item.url),
  }));

  return (
    <Sidebar className="border-0 border-transparent" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
        <div className="px-2 mt-2">
          <NavMain items={navMain} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavJournal />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  );
}
