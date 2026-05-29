"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { settingsItemForPath, settingsMenu, type SettingsMenuItem } from "../lib/settings-menu";
import type { Viewer } from "../lib/types";

const settingsItemBaseClass =
  "h-8 gap-2 rounded-[8px] px-2.5 py-0 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ease-out hover:bg-muted/60 data-active:bg-primary/10 data-active:font-medium data-active:text-foreground data-active:shadow-none data-active:[&_svg]:text-primary hover:text-foreground active:bg-muted active:text-foreground [&_svg]:size-3.5";

function settingsItemClass(active?: boolean) {
  return cn(
    settingsItemBaseClass,
    active
      ? "bg-primary/10 text-foreground [&_svg]:text-primary"
      : "text-muted-foreground [&_svg]:text-muted-foreground hover:[&_svg]:text-primary/70",
  );
}

export function SettingsRail({ viewer }: { viewer: Viewer | undefined }) {
  const pathname = usePathname();
  const active = settingsItemForPath(pathname).key;

  return (
    <Sidebar
      collapsible="offcanvas"
      className="border-r border-sidebar-border/80 bg-sidebar [&_[data-slot=sidebar-inner]]:bg-sidebar"
    >
      <SidebarHeader className="gap-3 px-3 pb-3 pt-3.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className={cn(settingsItemBaseClass, "text-muted-foreground hover:text-foreground")}
            >
              <Link href="/app">
                <ArrowLeftIcon className="size-3.5" />
                <span>Kembali ke chat</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="min-h-0 px-3 pb-3 pt-0">
        <div className="grid gap-5">
          <SettingsNavGroup label="Pribadi" active={active} />
          <SettingsNavGroup label="Riset" active={active} />
        </div>
      </SidebarContent>

      <SidebarFooter className="mt-auto px-3 py-3">
        <NavUser user={viewer} />
      </SidebarFooter>
    </Sidebar>
  );
}

function SettingsNavGroup({
  label,
  active,
}: {
  label: SettingsMenuItem["group"];
  active: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-1 px-0.5 pb-1.5 pt-0">
        <span className="text-[11px] font-medium tracking-[-0.01em] text-primary/75">{label}</span>
      </div>
      <SidebarMenu className="min-w-0 gap-1 overflow-hidden">
        {settingsMenu
          .filter((item) => item.group === label)
          .map((item) => (
            <SettingsNavRow key={item.key} item={item} active={active === item.key} />
          ))}
      </SidebarMenu>
    </div>
  );
}

function SettingsNavRow({ item, active }: { item: SettingsMenuItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <SidebarMenuItem className="min-w-0 overflow-hidden">
      <SidebarMenuButton asChild isActive={active} className={settingsItemClass(active)}>
        <Link href={item.href}>
          <Icon />
          <span>{item.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
