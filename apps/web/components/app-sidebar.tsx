"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { NavJournal } from "@/components/nav-journal";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import { NavThreads } from "@/components/nav-threads";
import { TeamSwitcher, type TeamSwitcherWorkspace } from "@/components/team-switcher";
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

type AppSidebarBootstrap = {
  workspaces?: TeamSwitcherWorkspace[];
  activeWorkspaceId?: string;
} | null;

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

export function AppSidebar({
  bootstrap,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  bootstrap?: AppSidebarBootstrap;
}) {
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
      className="border-0 border-transparent bg-background [--sidebar:var(--background)]"
      {...props}
    >
      <SidebarHeader>
        <TeamSwitcher
          activeWorkspaceId={bootstrap?.activeWorkspaceId ?? null}
          workspaces={bootstrap?.workspaces ?? []}
        />
        <div className="px-2 mt-2">
          <NavMain items={navMain} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {isJournalsRoute ? <NavJournal /> : <NavThreads />}
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  );
}
