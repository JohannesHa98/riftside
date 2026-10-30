"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { glideTo } from "./glide";

/** The anchor on the spotlight section, so a click can pull the view to it. */
export const SPOTLIGHT_ANCHOR = "player-spotlight";

/** Where a player's spotlight lives. One place, so the two ends agree. */
export function spotlightUrl(name: string): string {
  return `/stats?player=${encodeURIComponent(name)}`;
}

/** The same, with the anchor — for a link that is opened rather than clicked. */
export function spotlightHref(name: string): string {
  return `${spotlightUrl(name)}#${SPOTLIGHT_ANCHOR}`;
}

/** Glide to the spotlight, so it reads as the page moving rather than changing. */
export function glideToSpotlight() {
  const target = document.getElementById(SPOTLIGHT_ANCHOR);
  if (target !== null) glideTo(target);
}

/** Ctrl/⌘/shift-click and middle-click belong to the browser, not to us. */
function opensElsewhere(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

/**
 * A player's name on the stats page, which puts them in the spotlight rather
 * than leaving the site.
 *
 * The selection lives in the URL (`?player=`), which is how a name in the
 * ladder — rendered on the server, in its own Suspense boundary — can reach
 * the spotlight's state without the two knowing about each other.
 *
 * It is the name in the URL rather than the id, because `/stats?player=Esox`
 * is a link worth sending someone and `/stats?player=12` is not. Names are
 * UNIQUE in the database, so one always means one player. The cost is that
 * renaming a player breaks old links to them, which is a fair trade for a
 * roster of twenty friends.
 *
 * The href carries the `#player-spotlight` anchor so a copied link lands on
 * the panel in a fresh tab, where the browser does the scrolling — but an
 * ordinary click navigates without it. The App Router jumps straight to a
 * hash and overrides CSS scroll-behavior while it does, which would cut off
 * the glide below before it started.
 */
export function SpotlightLink({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  const router = useRouter();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (opensElsewhere(event)) return;

    event.preventDefault();
    router.replace(spotlightUrl(name), { scroll: false });
    glideToSpotlight();
  }

  return (
    <Link
      href={spotlightHref(name)}
      onClick={handleClick}
      title={`Put ${name} in the spotlight`}
      className={`underline decoration-ink-dim/40 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold ${className}`}
    >
      {name}
    </Link>
  );
}
