"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { SplurreToggle } from "./splurre-toggle";

// New game first: it is what the site is opened for.
const LINKS = [
  { href: "/new-game", label: "New game" },
  { href: "/players", label: "Players" },
  { href: "/history", label: "History" },
  { href: "/stats", label: "Stats" },
] as const;

/**
 * `sessionSlot` is rendered on the server and passed in, because this
 * component is a client one (it needs usePathname) and reading the session
 * cookie has to happen server-side.
 */
export function SiteNav({ sessionSlot }: { sessionSlot: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const isCurrent = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="border-b border-line bg-panel/80 backdrop-blur">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        <div className="flex items-center justify-between gap-3 py-3">
          <Link
            href="/"
            // The logo navigates too, so it closes the menu like any link.
            onClick={() => setMenuOpen(false)}
            className="text-lg font-semibold tracking-tight"
          >
            <span className="text-gold">In-house</span> League
          </Link>

          {/* Everything on one row from small screens up. */}
          <div className="hidden items-center gap-2 sm:flex">
            {/*
              p-1.5 is not decoration: this scrolls sideways on narrow screens,
              and setting overflow-x forces overflow-y to clip too, so a focus
              ring on any link would be sliced off without room to draw in.
            */}
            <nav className="-m-1.5 flex items-center gap-1 overflow-x-auto p-1.5">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={isCurrent(link.href) ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    isCurrent(link.href)
                      ? "bg-raised text-ink"
                      : "text-ink-dim hover:bg-raised/60 hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {sessionSlot}

            <SplurreToggle />
          </div>

          {/* On a phone the links fold behind this, beside the logo. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="-mr-1 rounded-md p-2 text-ink-dim transition-colors hover:bg-raised/60 hover:text-ink sm:hidden"
          >
            {menuOpen ? <CloseIcon /> : <BurgerIcon />}
          </button>
        </div>

        <div id="site-menu" hidden={!menuOpen} className="pb-3 sm:hidden">
          <nav className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                // Closed on tap rather than by watching the path change, so
                // tapping the page you are already on still closes the menu.
                onClick={() => setMenuOpen(false)}
                aria-current={isCurrent(link.href) ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isCurrent(link.href)
                    ? "bg-raised text-ink"
                    : "text-ink-dim hover:bg-raised/60 hover:text-ink"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="mt-2 flex items-center gap-2 border-t border-line pt-2">
            {sessionSlot}
            <SplurreToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

function BurgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5 fill-none stroke-current stroke-2"
    >
      <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="size-5 fill-none stroke-current stroke-2"
    >
      <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
