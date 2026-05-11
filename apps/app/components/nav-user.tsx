"use client";

import { useRouter } from "next/navigation";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MailIcon,
  MoreHorizontalIcon,
  UserRoundIcon,
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
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="grid gap-1 p-2 font-normal">
                <div className="flex items-center gap-2 text-sm">
                  <UserRoundIcon className="size-4 text-muted-foreground" />
                  <span className="truncate font-medium">{name}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <MailIcon className="size-3.5" />
                  <span className="truncate">{email}</span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}>
                <LogOutIcon />
                Sign out
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled>
                <ChevronsUpDownIcon />
                Account switcher
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between gap-3 px-2 py-1.5">
                <span className="text-xs font-medium text-muted-foreground">
                  Theme
                </span>
                <ThemeToggle
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 rounded-[7px] text-muted-foreground hover:bg-muted"
                />
              </div>
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
