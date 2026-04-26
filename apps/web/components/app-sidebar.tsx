"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { NavJournal } from "@/components/nav-journal";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavThreads } from "@/components/nav-threads";
import { TeamSwitcher } from "@/components/team-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  AudioLinesIcon,
  BlocksIcon,
  HomeIcon,
  InboxIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  Settings2Icon,
  TerminalIcon,
} from "lucide-react";

// This is sample data.
const data = {
  teams: [
    {
      name: "Acme Inc",
      logo: <TerminalIcon />,
      plan: "Enterprise",
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
    },
    {
      title: "Journal",
      url: "/app",
      icon: <HomeIcon />,
    },
    {
      title: "Threads",
      url: "/app/threads",
      icon: <InboxIcon />,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: <Settings2Icon />,
    },
    {
      title: "Templates",
      url: "#",
      icon: <BlocksIcon />,
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
        <NavMain items={navMain} />
      </SidebarHeader>
      <SidebarContent>
        <NavJournal />
        <NavThreads />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
