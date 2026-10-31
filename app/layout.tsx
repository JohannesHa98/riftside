import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Suspense } from "react";

import { SessionControls } from "@/components/session-controls";
import { SiteFooter } from "@/components/site-footer";
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
  title: "Riftside",
  description: "Two even sides of the Rift for in-house League of Legends games.",
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
        {/*
          First thing in the tab order, invisible until it is focused: a
          keyboard user lands on it and can jump past the nav instead of
          tabbing through it on every page.
        */}
        <a
          href="#main"
          // fixed! because globals.css gives every :focus-visible element
          // position: relative to lift its ring above its neighbours. Without
          // the override this link joins the layout when focused, pushing the
          // header down and shoving the page sideways by its own offset.
          className="sr-only focus:not-sr-only focus:fixed! focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-raised focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-ink"
        >
          Skip to content
        </a>

        <SiteNav
          sessionSlot={
            <Suspense fallback={null}>
              <SessionControls />
            </Suspense>
          }
        />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10"
        >
          {children}
        </main>

        <SiteFooter />
      </body>
    </html>
  );
}
