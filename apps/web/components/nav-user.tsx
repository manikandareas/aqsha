"use client";

import { ChevronDownIcon, LogOutIcon, UserIcon } from "lucide-react";

import { SignOutAlertDialog } from "@/features/auth/components/sign-out-alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { useSignOut } from "@/features/auth/hooks/use-sign-out";
import { authClient } from "@/lib/auth-client";
import { getDiceBearAvatarUrl } from "@/lib/avatar";

export function NavUser() {
  const { isMobile } = useSidebar();
  const { data: session, isPending } = authClient.useSession();
  const {
    isSignOutAlertOpen,
    isSigningOut,
    setIsSignOutAlertOpen,
    handleSignOut,
  } = useSignOut();
  const user = session?.user;
  const name = user?.name ?? "User";
  const email = user?.email ?? "";
  const avatarUrl = user?.image ?? getDiceBearAvatarUrl(name);

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground mb-2"
                />
              }
            >
              <div className="relative">
                <img
                  src={avatarUrl}
                  alt={name}
                  className="h-9 w-9 shrink-0 rounded-full object-cover select-none"
                />
                <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-notion-green ring-2 ring-sidebar" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight ml-1">
                <span className="truncate font-medium text-[15px]">
                  {isPending ? "Loading..." : name}
                </span>
              </div>
              <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </DropdownMenuTrigger>

            <DropdownMenuContent
              className="w-56 rounded-lg"
              side={isMobile ? "bottom" : "right"}
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <img
                    src={avatarUrl}
                    alt={name}
                    className="h-8 w-8 shrink-0 rounded-full object-cover select-none"
                  />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{name}</span>
                    <span className="truncate text-[12px] text-muted-foreground">
                      {email}
                    </span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <UserIcon className="text-muted-foreground" />
                  <span>Profile</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => setIsSignOutAlertOpen(true)}
              >
                <LogOutIcon />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <SignOutAlertDialog
        open={isSignOutAlertOpen}
        isSigningOut={isSigningOut}
        onOpenChange={setIsSignOutAlertOpen}
        onSignOut={handleSignOut}
      />
    </>
  );
}
