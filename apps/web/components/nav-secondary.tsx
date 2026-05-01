"use client";

import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";

export function NavSecondary({
  items,
  ...props
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    badge?: React.ReactNode;
  }[];
} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const { setTheme, theme } = useTheme();

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<a href={item.url} />}
                className="h-8 text-[13px] font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground"
              >
                <span className="shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px]">
                  {item.icon}
                </span>
                <span>{item.title}</span>
              </SidebarMenuButton>
              {item.badge && <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>}
            </SidebarMenuItem>
          ))}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-8 text-[13px] font-medium text-sidebar-foreground/65 hover:text-sidebar-foreground"
            >
              <Sun className="h-[15px] w-[15px] shrink-0 dark:hidden" />
              <Moon className="hidden h-[15px] w-[15px] shrink-0 dark:block" />
              <span>Toggle theme</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <NavUser />
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
