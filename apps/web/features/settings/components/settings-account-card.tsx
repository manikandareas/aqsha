"use client";

import { LogOutIcon } from "lucide-react";

import { SignOutAlertDialog } from "@/features/auth/components/sign-out-alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";

type SettingsAccountCardProps = {
  email: string;
};

export function SettingsAccountCard({ email }: SettingsAccountCardProps) {
  const {
    isSignOutAlertOpen,
    isSigningOut,
    setIsSignOutAlertOpen,
    handleSignOut,
  } = useSignOut();

  return (
    <Card id="account" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Account & Security</CardTitle>
        <CardDescription>Manage the current session and security actions.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y">
        <div className="flex flex-col gap-3 py-4 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <div className="text-sm font-medium">Signed in as</div>
            <div className="text-sm text-muted-foreground">{email || "No active email found"}</div>
          </div>
          <Button variant="outline" onClick={() => setIsSignOutAlertOpen(true)}>
            <LogOutIcon />
            Sign out
          </Button>
        </div>
        <div className="flex flex-col gap-3 py-4 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-1">
            <div className="text-sm font-medium">Danger zone</div>
            <div className="text-sm text-muted-foreground">Password changes and account deletion require dedicated flows.</div>
          </div>
          <Badge variant="outline">Coming soon</Badge>
        </div>
      </CardContent>

      <SignOutAlertDialog
        open={isSignOutAlertOpen}
        isSigningOut={isSigningOut}
        onOpenChange={setIsSignOutAlertOpen}
        onSignOut={handleSignOut}
      />
    </Card>
  );
}
