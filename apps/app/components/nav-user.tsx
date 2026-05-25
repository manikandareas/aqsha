"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  SettingsIcon,
} from "lucide-react";
import { ThemeMenuSub } from "@/components/theme-toggle";
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="h-10 min-w-0 rounded-[8px] border border-sidebar-border/70 bg-muted/15 px-2.5 py-2.5 text-muted-foreground transition-[background-color,border-color,color] duration-150 ease-out hover:border-primary/20 hover:bg-primary/5 hover:text-foreground data-[state=open]:border-primary/25 data-[state=open]:bg-primary/8 data-[state=open]:text-foreground"
            >
              <Avatar className="h-6 w-6 shrink-0 rounded-full ring-1 ring-sky-soft-border">
                {user?.image ? <AvatarImage src={user.image} alt={name} /> : null}
                <AvatarFallback className="rounded-full bg-sky-soft text-[10px] font-semibold text-sky-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-left text-[12px] font-medium">
                {name}
              </span>
              <ChevronsUpDownIcon className="size-3 shrink-0 text-muted-foreground" />
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
                <Avatar className="h-8 w-8 rounded-full ring-1 ring-sky-soft-border">
                  {user?.image ? <AvatarImage src={user.image} alt={name} /> : null}
                  <AvatarFallback className="rounded-full bg-sky-soft text-xs font-semibold text-sky-foreground">
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
            <ThemeMenuSub />
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut} className={menuItemClass}>
              <LogOutIcon />
              <span className="truncate">Sign out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
