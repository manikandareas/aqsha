import type { Metadata } from "next";
import { Fuzzy_Bubbles, Geist_Mono, Nunito } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const aqshaDisplay = Nunito({
  variable: "--font-aqsha-display-loaded",
  subsets: ["latin"],
});

const aqshaHandwriting = Fuzzy_Bubbles({
  variable: "--font-aqsha-handwriting-loaded",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Aqsha Web",
  description:
    "Next.js 16 app wired to the Bun API.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${aqshaDisplay.variable} ${aqshaHandwriting.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className={`${aqshaDisplay.className} min-h-full flex flex-col`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
