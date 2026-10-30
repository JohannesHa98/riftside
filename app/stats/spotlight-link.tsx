import Link from "next/link";

/** The anchor on the spotlight section, so a click can pull the view to it. */
export const SPOTLIGHT_ANCHOR = "player-spotlight";

/** Where a player's spotlight lives. One place, so the two ends agree. */
export function spotlightUrl(name: string): string {
  return `/stats?player=${encodeURIComponent(name)}#${SPOTLIGHT_ANCHOR}`;
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
 */
export function SpotlightLink({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={spotlightUrl(name)}
      title={`Put ${name} in the spotlight`}
      className={`underline decoration-ink-dim/40 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold ${className}`}
    >
      {name}
    </Link>
  );
}
