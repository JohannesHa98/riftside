/**
 * The legal line is not decoration: Riot's policy for third-party projects
 * asks anything built on their data to say plainly that it is not theirs.
 * Every League site carries some version of it.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto w-full max-w-5xl space-y-2 px-4 py-6 sm:px-6">
        <p className="text-sm font-semibold tracking-tight">
          <span className="text-gold">In-house</span> League
        </p>

        <p className="text-xs text-ink-dim">
          Not endorsed by Riot Games and does not reflect the views of Riot
          Games or anyone officially involved in producing or managing League
          of Legends. Riot Games and all associated properties are trademarks
          or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
