"use client";

import Link from "next/link";
import React from "react";
import { cn } from "@/lib/utils";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  url: string;
  icon: React.ReactNode;
  isActive?: boolean;
  shortcut?: string;
  /** Renders the item as a search-input-style row */
  variant?: "search";
  /** Icon shown on the right of the button */
  rightIcon?: React.ReactNode;
};

export function NavMain({ items }: { items: NavItem[] }) {
  return (
    <SidebarMenu className="gap-1">
      {items.map((item) => {
        if (item.variant === "search") {
          return (
            <SidebarMenuItem key={item.title} className="mb-3">
              <SidebarMenuButton
                render={<Link href={item.url} />}
                tooltip={item.title}
                className={cn(
                  "h-9 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/45",
                  "text-sidebar-foreground/55 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                  "focus-visible:ring-sidebar-ring",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">
                    {item.icon}
                  </span>
                  <span className="truncate text-[13px] font-medium">
                    {item.title}
                  </span>
                </span>
                {item.shortcut ? (
                  <span className="ml-auto shrink-0 rounded text-[11px] font-medium text-sidebar-foreground/35 tabular-nums group-data-[collapsible=icon]:hidden">
                    {item.shortcut}
                  </span>
                ) : null}
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        }

        return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              isActive={item.isActive}
              render={<a href={item.url} />}
              tooltip={item.title}
              className={cn(
                "h-9 rounded-lg text-[13px] font-semibold transition-colors",
                "focus-visible:ring-sidebar-ring",
                item.isActive
                  ? "bg-sidebar-accent/55 text-sidebar-foreground hover:bg-sidebar-accent/65"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/45 hover:text-sidebar-foreground",
              )}
            >
              <span
                className={cn(
                  "shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]",
                  item.isActive
                    ? "text-sidebar-foreground/70"
                    : "text-sidebar-foreground/45",
                )}
              >
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.title}</span>
              {item.rightIcon ? (
                <span
                  className={cn(
                    "ml-auto shrink-0 group-data-[collapsible=icon]:hidden [&_svg]:h-3.5 [&_svg]:w-3.5",
                    item.isActive
                      ? "text-sidebar-foreground/60"
                      : "text-sidebar-foreground/30",
                  )}
                >
                  {item.rightIcon}
                </span>
              ) : null}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}
