"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

export function useSignOut() {
  const router = useRouter();
  const [isSignOutAlertOpen, setIsSignOutAlertOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      await authClient.signOut();
      router.push("/signin");
      router.refresh();
    } catch {
      setIsSigningOut(false);
    }
  }

  return {
    isSignOutAlertOpen,
    isSigningOut,
    setIsSignOutAlertOpen,
    handleSignOut,
  };
}
