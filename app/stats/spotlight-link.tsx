import Link from "next/link";

/** The anchor on the spotlight section, so a click can pull the view to it. */
export const SPOTLIGHT_ANCHOR = "player-spotlight";

/**
 * A player's name on the stats page, which puts them in the spotlight rather
 * than leaving the site.
 *
 * The selection lives in the URL (`?player=`), which is how a name in the
 * ladder — rendered on the server, in its own Suspense boundary — can reach
 * the spotlight's state without the two knowing about each other. It also
 * means a spotlight can be linked to.
 */
export function SpotlightLink({
  playerId,
  name,
  className = "",
}: {
  playerId: number;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={`/stats?player=${playerId}#${SPOTLIGHT_ANCHOR}`}
      title={`Put ${name} in the spotlight`}
      className={`underline decoration-ink-dim/40 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold ${className}`}
    >
      {name}
    </Link>
  );
}
