"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SplurreToggle } from "./splurre-toggle";

import type { ReactNode } from "react";

const LINKS = [
  { href: "/players", label: "Players" },
  { href: "/new-game", label: "New game" },
  { href: "/history", label: "History" },
] as const;

/**
 * `sessionSlot` is rendered on the server and passed in, because this
 * component is a client one (it needs usePathname) and reading the session
 * cookie has to happen server-side.
 */
export function SiteNav({ sessionSlot }: { sessionSlot: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="border-b border-line bg-panel/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          <span className="text-gold">In-house</span> League
        </Link>

        <div className="flex items-center gap-2">
          <nav className="-mx-1 flex items-center gap-1 overflow-x-auto">
            {LINKS.map((link) => {
              const active =
                pathname === link.href || pathname.startsWith(`${link.href}/`);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? "bg-raised text-ink"
                      : "text-ink-dim hover:bg-raised/60 hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {sessionSlot}

          <SplurreToggle />
        </div>
      </div>
    </header>
  );
}
