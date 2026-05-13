"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  LogOutIcon,
  SettingsIcon,
  MoreHorizontalIcon,
  PaletteIcon,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { authClient } from "@/lib/auth-client";

type Viewer = {
  name: string | null;
  email: string | null;
  image: string | null;
};

export function NavUser({ user }: { user: Viewer | undefined }) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const name = user?.name || "Aqsha user";
  const email = user?.email || "Signed in";
  const initials = getInitials(name, email);

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  const menuItemClass =
    "h-9 gap-2 rounded-[8px] px-2 text-[13px] font-medium text-popover-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <div className="flex min-w-0 items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="h-11 min-w-0 flex-1 rounded-[10px] px-2 text-sidebar-foreground/90 hover:bg-muted/70 data-[state=open]:bg-muted data-[state=open]:text-foreground"
              >
                <Avatar className="h-8 w-8 rounded-full ring-1 ring-[var(--sky-soft-border)]">
                  {user?.image ? (
                    <AvatarImage src={user.image} alt={name} />
                  ) : null}
                  <AvatarFallback className="rounded-full bg-[var(--sky-soft)] text-xs font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-medium">
                    {name}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    Research
                  </span>
                </div>
                <MoreHorizontalIcon className="ml-auto size-3.5 text-muted-foreground" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-[12px] p-1.5"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-2 font-normal">
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar className="h-8 w-8 rounded-full ring-1 ring-[var(--sky-soft-border)]">
                    {user?.image ? (
                      <AvatarImage src={user.image} alt={name} />
                    ) : null}
                    <AvatarFallback className="rounded-full bg-[var(--sky-soft)] text-xs font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 gap-0.5">
                    <span className="truncate text-[13px] font-semibold text-popover-foreground">
                      {name}
                    </span>
                    <span className="truncate text-[11px] font-medium text-muted-foreground">
                      {email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className={menuItemClass}>
                <Link href="/settings/overview">
                  <SettingsIcon />
                  <span className="truncate">Settings</span>
                </Link>
              </DropdownMenuItem>
              <div className="flex h-9 items-center gap-2 rounded-[8px] px-2 text-[13px] font-medium text-popover-foreground">
                <PaletteIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">Theme</span>
                <ThemeToggle
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 shrink-0 rounded-[7px] text-muted-foreground hover:bg-muted"
                />
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut} className={menuItemClass}>
                <LogOutIcon />
                <span className="truncate">Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getInitials(name: string, email: string) {
  const source = name === "Aqsha user" ? email : name;
  return source
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
