"use client";

import React from "react";
import { ChevronDownIcon, LogOutIcon, UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

// Placeholder user — wire to real auth session when ready
const PLACEHOLDER_USER = {
  name: "Naufal",
  email: "naufal@example.com",
  initial: "N",
};

export function NavUser() {
  const { isMobile } = useSidebar();
  const user = PLACEHOLDER_USER;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mb-2"
              />
            }
          >
            {/* Avatar */}
            <div className="relative">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-white text-sm font-semibold select-none">
                {user.initial}
              </span>
              <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-notion-green ring-2 ring-sidebar" />
            </div>
            {/* Name */}
            <div className="grid flex-1 text-left text-sm leading-tight ml-1">
              <span className="truncate font-medium text-[15px]">
                {user.name}
              </span>
            </div>
            <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            className="w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-chart-3 text-white text-sm font-semibold select-none">
                  {user.initial}
                </span>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-[12px] text-muted-foreground">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <UserIcon className="text-muted-foreground" />
                <span>Profile</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">
              <LogOutIcon />
              <span>Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
