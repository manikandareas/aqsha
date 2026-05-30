import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppToaster } from "@/components/app-toaster";
import { siteName } from "@/lib/metadata";
import { ConvexClientProvider } from "./convex-client-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["700", "800"],
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
  description: "Aqsha is a research workspace for focused inquiry, threads, and curated knowledge.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${playfairDisplay.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <ConvexClientProvider>
              <NuqsAdapter>
                <TooltipProvider>{children}</TooltipProvider>
              </NuqsAdapter>
              <AppToaster />
            </ConvexClientProvider>
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
