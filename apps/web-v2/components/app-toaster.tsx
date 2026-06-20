"use client";

import { Toaster } from "sonner";
import { useTheme } from "next-themes";

export function AppToaster() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      closeButton
      expand
      gap={10}
      offset={20}
      position="bottom-right"
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      toastOptions={{
        classNames: {
          toast: "border-border bg-card text-card-foreground shadow-aqsha",
        },
      }}
      visibleToasts={4}
    />
  );
}
