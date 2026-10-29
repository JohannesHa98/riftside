import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Suspense } from "react";

import { SessionControls } from "@/components/session-controls";
import { SiteNav } from "@/components/site-nav";
import { themeScript } from "@/components/splurrp-toggle";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "In-house League",
  description: "Balanced 5v5 teams for in-house League of Legends games.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The script below sets data-theme before React hydrates, so this one
      // element legitimately differs from the server markup.
      suppressHydrationWarning
    >
      <head>
        {/* Applies a stored light preference before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        <SiteNav
          sessionSlot={
            <Suspense fallback={null}>
              <SessionControls />
            </Suspense>
          }
        />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
