"use client";

import { Loader2Icon } from "lucide-react";

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

type SignOutAlertDialogProps = {
  open: boolean;
  isSigningOut: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void | Promise<void>;
};

export function SignOutAlertDialog({
  open,
  isSigningOut,
  onOpenChange,
  onSignOut,
}: SignOutAlertDialogProps) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSigningOut) {
          onOpenChange(nextOpen);
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
            onClick={onSignOut}
          >
            {isSigningOut ? <Loader2Icon className="animate-spin" /> : null}
            Sign out
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
