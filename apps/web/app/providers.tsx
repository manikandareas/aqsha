"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactQueryProvider } from "@/lib/react-query/client";

export function Providers({ children }: { children: React.ReactNode }) {
  const scriptProps =
    typeof window === "undefined"
      ? undefined
      : ({ type: "application/json" } as const);

  return (
    <ThemeProvider
      scriptProps={scriptProps}
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ReactQueryProvider>
        <TooltipProvider>
          {children}
          <Toaster />
        </TooltipProvider>
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
