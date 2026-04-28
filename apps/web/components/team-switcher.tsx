"use client";

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { BellIcon, ChevronDownIcon, PlusIcon } from "lucide-react";

export function TeamSwitcher({
  teams,
}: {
  teams: {
    name: string;
    logo: React.ReactNode;
    plan: string;
    color?: string;
  }[];
}) {
  const [activeTeam, setActiveTeam] = React.useState(teams[0]);
  if (!activeTeam) {
    return null;
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Row: workspace switcher + notification bell */}
        <div className="flex items-center justify-between gap-2 px-1">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton className="flex-1 max-w-fit" />}
            >
              <div
                className={`flex aspect-square size-[28px] shrink-0 items-center justify-center rounded-lg ${
                  activeTeam.color ||
                  "bg-sidebar-primary text-sidebar-primary-foreground"
                } [&_svg]:h-[18px] [&_svg]:w-[18px]`}
              >
                {activeTeam.logo}
              </div>
              <span className="truncate text-[15px] font-semibold">
                {activeTeam.name}
              </span>
              <ChevronDownIcon className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-64 rounded-lg"
              align="start"
              side="bottom"
              sideOffset={4}
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Teams
                </DropdownMenuLabel>
                {teams.map((team, index) => (
                  <DropdownMenuItem
                    key={team.name}
                    onClick={() => setActiveTeam(team)}
                    className="gap-2 p-2"
                  >
                    <div
                      className={`flex size-6 items-center justify-center rounded-xs border ${
                        team.color || ""
                      } [&_svg]:h-3.5 [&_svg]:w-3.5`}
                    >
                      {team.logo}
                    </div>
                    {team.name}
                    <DropdownMenuShortcut>⌘{index + 1}</DropdownMenuShortcut>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                    <PlusIcon className="size-4" />
                  </div>
                  <div className="font-medium text-muted-foreground">
                    Add team
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notification bell */}
          <button
            type="button"
            aria-label="Notifications"
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <BellIcon className="h-[18px] w-[18px]" />
            <span className="absolute top-1.5 right-1.5 flex h-2 w-2 rounded-full bg-primary ring-2 ring-sidebar" />
          </button>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
