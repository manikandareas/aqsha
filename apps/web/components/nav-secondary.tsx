"use client";

import React from "react";

import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NavUser } from "./nav-user";

export function NavSecondary({
  items,
  className,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  return (
    <SidebarGroup className={cn("gap-2 p-0", className)} {...props}>
      <SidebarGroupContent className="grid gap-1.5">
        <div className="rounded-[12px] bg-sidebar-accent/25 px-3 py-3 text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          <div className="text-[13px] font-semibold leading-5">Upgrade to Pro</div>
          <p className="mt-1 text-[12px] font-medium leading-5 text-sidebar-foreground/52">
            More threads, exports, and review tools.
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 rounded-lg px-2 text-[12px] font-semibold text-sidebar-foreground/68 hover:bg-sidebar-accent/65 hover:text-sidebar-foreground"
          >
            Upgrade
          </Button>
        </div>

        <SidebarMenu className="gap-1">
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<a href={item.url} />}
                tooltip={item.title}
                className="h-8 rounded-lg text-[13px] font-medium text-sidebar-foreground/62 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-sidebar-ring"
              >
                <span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">
                  {item.icon}
                </span>
                <span>{item.title}</span>
              </SidebarMenuButton>
              {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <NavUser />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
