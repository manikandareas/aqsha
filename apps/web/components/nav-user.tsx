"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ChevronDownIcon,
  Loader2Icon,
  LogOutIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { authClient } from "@/lib/auth-client";

function getDiceBearAvatarUrl(name: string): string {
  return `https://api.dicebear.com/9.x/adventurer-neutral/svg?seed=${encodeURIComponent(name)}`;
}

export function NavUser() {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { setTheme, theme } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const [isSignOutAlertOpen, setIsSignOutAlertOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const user = session?.user;
  const name = user?.name ?? "User";
  const email = user?.email ?? "";
  const avatarUrl = user?.image ?? getDiceBearAvatarUrl(name);

  async function handleSignOut() {
    setIsSigningOut(true);
    await authClient.signOut();
    router.push("/signin");
    router.refresh();
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <SidebarMenuButton
                  size="lg"
                  tooltip={name}
                  className="h-12 rounded-[12px] bg-sidebar-accent/25 p-2 text-sidebar-foreground hover:bg-sidebar-accent/55 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent/60 data-[state=open]:text-sidebar-foreground group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:bg-transparent"
                />
              }
            >
              <div className="relative shrink-0">
                <img
                  src={avatarUrl}
                  alt={name}
                  className="size-9 select-none rounded-[10px] object-cover"
                />
                <span className="absolute -bottom-0.5 -right-0.5 block size-2 rounded-full bg-sidebar-foreground/30 ring-2 ring-sidebar" />
              </div>
              <div className="ml-1 grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                <span className="truncate text-[13px] font-bold text-sidebar-foreground">
                  {isPending ? "Loading..." : name}
                </span>
                <span className="truncate text-[11px] font-medium text-sidebar-foreground/50">
                  {email || "Free plan"}
                </span>
              </div>
              <ChevronDownIcon className="ml-auto h-4 w-4 shrink-0 text-sidebar-foreground/45 group-data-[collapsible=icon]:hidden" />
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
                    className="h-8 w-8 shrink-0 select-none rounded-[9px] object-cover"
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
                <DropdownMenuItem
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                >
                  <SunIcon className="text-muted-foreground dark:hidden" />
                  <MoonIcon className="hidden text-muted-foreground dark:block" />
                  <span>Toggle theme</span>
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

      <AlertDialog
        open={isSignOutAlertOpen}
        onOpenChange={(open) => {
          if (!isSigningOut) {
            setIsSignOutAlertOpen(open);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll need to sign in again to access your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSigningOut}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSigningOut}
              onClick={handleSignOut}
            >
              {isSigningOut ? <Loader2Icon className="animate-spin" /> : null}
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
