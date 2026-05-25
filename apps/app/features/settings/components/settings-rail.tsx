"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon, MoreHorizontalIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { getInitials } from "../lib/settings-format";
import { settingsItemForPath, settingsMenu, type SettingsMenuItem } from "../lib/settings-menu";
import type { Viewer } from "../lib/types";

export function SettingsRail({ viewer }: { viewer: Viewer | undefined }) {
  const pathname = usePathname();
  const active = settingsItemForPath(pathname).key;
  const name = viewer?.name || "Aqsha user";
  const email = viewer?.email || "Signed in";

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/60 bg-sidebar/95 backdrop-blur-sm [&_[data-slot=sidebar-inner]]:bg-sidebar/95"
    >
      <SidebarHeader className="gap-3 px-3 pb-2 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out"
            >
              <Link href="/">
                <ArrowLeftIcon className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" />
                <span>Kembali ke Chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2 pb-1 pt-0">
        <SettingsGroup label="Personal" active={active} />
        <SettingsGroup label="Research" active={active} />
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-border/40 p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton className="h-11 min-w-0 rounded-[10px] px-2.5 text-sidebar-foreground/90 hover:bg-muted/60 active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out">
              <Avatar className="h-8 w-8 rounded-full ring-1 ring-border/50">
                {viewer?.image ? <AvatarImage src={viewer.image} alt={name} /> : null}
                <AvatarFallback className="rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {getInitials(name, email)}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-[13px] font-medium">{name}</span>
                <span className="truncate text-[11px] text-muted-foreground">Settings</span>
              </div>
              <MoreHorizontalIcon className="ml-auto size-3.5 text-muted-foreground" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

function SettingsGroup({ label, active }: { label: SettingsMenuItem["group"]; active: string }) {
  return (
    <SidebarGroup className="px-1.5 py-1.5">
      <SidebarGroupLabel className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
        {label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {settingsMenu
            .filter((item) => item.group === label)
            .map((item) => (
              <SettingsNavRow key={item.key} item={item} active={active === item.key} />
            ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SettingsNavRow({ item, active }: { item: SettingsMenuItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton
        asChild
        isActive={active}
        className={cn(
          "h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-sidebar-foreground/90 hover:bg-muted/60 hover:text-foreground active:scale-[0.97] transition-[background-color,color,box-shadow,transform] duration-150 ease-out",
          active && "bg-primary/10 text-primary font-semibold hover:bg-primary/15 hover:text-primary",
        )}
      >
        <Link href={item.href}>
          <Icon className={cn("size-3.5 text-muted-foreground transition-colors duration-150", active && "text-primary")} />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
