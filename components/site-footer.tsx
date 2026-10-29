/**
 * The legal line is not decoration: Riot's policy for third-party projects
 * asks anything built on their data to say plainly that it is not theirs.
 * Every League site carries some version of it.
 */
export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-ink-dim sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <p>
          <span className="text-gold">In-house</span> League — games are read
          from the League client and recorded automatically.
        </p>

        <p className="max-w-prose sm:text-right">
          Not endorsed by Riot Games and does not reflect the views of Riot
          Games or anyone officially involved in producing or managing League
          of Legends. Riot Games and all associated properties are trademarks
          or registered trademarks of Riot Games, Inc.
        </p>
      </div>
    </footer>
  );
}
