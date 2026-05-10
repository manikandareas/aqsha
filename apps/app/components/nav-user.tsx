"use client";

import { useRouter } from "next/navigation";
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  MailIcon,
  UserRoundIcon,
} from "lucide-react";
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {user?.image ? (
                  <AvatarImage src={user.image} alt={name} />
                ) : null}
                <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{name}</span>
                <span className="truncate text-xs">{email}</span>
              </div>
              <ChevronsUpDownIcon className="ml-auto size-4" />
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
