"use client";

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
    <SidebarMenu className="gap-[4px]">
      {items.map((item) => {
        if (item.variant === "search") {
          return (
            <SidebarMenuItem key={item.title} className="mb-4">
              {/* Search — rendered as a clickable input-style row */}
              <SidebarMenuButton
                render={<a href={item.url} />}
                className={cn(
                  // input-box look: muted background + rounded border
                  "h-8 rounded-md border border-sidebar-border/60 bg-sidebar-accent/50",
                  "text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/70",
                  "transition-colors",
                )}
              >
                {/* Left: icon + placeholder text */}
                <span className="flex flex-1 items-center gap-2 min-w-0">
                  <span className="shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5 opacity-60">
                    {item.icon}
                  </span>
                  <span className="truncate text-[13px] font-medium">
                    {item.title}
                  </span>
                </span>
                {/* Right: keyboard shortcut */}
                {item.shortcut ? (
                  <span className="ml-auto shrink-0 rounded text-[11px] font-medium text-sidebar-foreground/35 tabular-nums">
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
              className={cn(
                "h-10 rounded-md transition-colors",
                item.isActive
                  ? [
                      // Active state: left accent bar + semibold text + accent bg
                      "relative pl-3",
                      "font-semibold text-sidebar-foreground",
                      "bg-sidebar-accent hover:bg-sidebar-accent",
                      // Left border accent — uses destructive token (warm orange)
                      "before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2",
                      "before:h-[55%] before:w-[3px] before:rounded-r-full before:bg-primary",
                    ]
                  : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              {/* Left icon */}
              <span
                className={cn(
                  "shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]",
                  item.isActive
                    ? "text-sidebar-foreground"
                    : "text-sidebar-foreground/55",
                )}
              >
                {item.icon}
              </span>
              {/* Label */}
              <span className="flex-1 truncate text-[13px] font-medium">
                {item.title}
              </span>
              {/* Right icon — bookmark etc. */}
              {item.rightIcon ? (
                <span
                  className={cn(
                    "ml-auto shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
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
