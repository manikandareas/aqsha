import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/themes";
import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToaster } from "@/components/app-toaster";
import { AuthenticatedUserSync } from "@/components/authenticated-user-sync";
import { MotionProvider } from "@/components/motion-provider";
import { OnboardingGate } from "@/components/onboarding-gate";
import { QueryProvider } from "@/lib/query-provider";
import { siteName } from "@/lib/metadata";
import "./globals.css";

// Disalin dari apps/web; provider Clerk dipasang lagi di P1 (Convex tetap di-drop).
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  applicationName: siteName,
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: "Aqsha V2 — research workspace (foundations rail).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ClerkProvider appearance={{ theme: shadcn }}>
          <QueryProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="system"
              enableSystem
              disableTransitionOnChange
            >
              <OnboardingGate>
                <NuqsAdapter>
                  <MotionProvider>
                    <TooltipProvider>{children}</TooltipProvider>
                  </MotionProvider>
                </NuqsAdapter>
              </OnboardingGate>
              <AppToaster />
              <AuthenticatedUserSync />
            </ThemeProvider>
          </QueryProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
