"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";

import { inputStyles } from "@/components/ui";

export interface RosterEntry {
  id: number;
  name: string;
  /** Searchable too, so looking up "ES0X" finds Esox. */
  riotId: string | null;
  archived: boolean;
  /**
   * The row, rendered on the server and passed down. Filtering happens here
   * so it is instant, but the rows themselves stay server components with
   * their forms and bound actions intact.
   */
  row: ReactNode;
}

export function RosterSearch({ entries }: { entries: RosterEntry[] }) {
  const [query, setQuery] = useState("");

  const needle = query.trim().toLocaleLowerCase();

  const matching = useMemo(() => {
    if (needle.length === 0) return entries;

    return entries.filter((entry) =>
      `${entry.name} ${entry.riotId ?? ""}`.toLocaleLowerCase().includes(needle),
    );
  }, [entries, needle]);

  const active = matching.filter((entry) => !entry.archived);
  const retired = matching.filter((entry) => entry.archived);

  return (
    <>
      <div className="relative mb-4">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={`Search ${entries.length} players by name or Riot ID`}
          aria-label="Search players"
          className={inputStyles}
        />
        {needle.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-2 text-xs text-ink-dim hover:text-ink"
          >
            Clear
          </button>
        ) : null}
      </div>

      {matching.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-ink-dim">
          Nobody matches “{query.trim()}”.
        </p>
      ) : (
        <div className="space-y-8">
          <Section
            heading={`${active.length} active`}
            entries={active}
            emptyNote="No active players match."
          />

          {retired.length > 0 ? (
            <Section heading={`${retired.length} retired`} entries={retired} />
          ) : null}
        </div>
      )}
    </>
  );
}

function Section({
  heading,
  entries,
  emptyNote,
}: {
  heading: string;
  entries: RosterEntry[];
  emptyNote?: string;
}) {
  if (entries.length === 0) {
    return emptyNote === undefined ? null : (
      <p className="text-sm text-ink-dim">{emptyNote}</p>
    );
  }

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold text-ink-dim uppercase">{heading}</h2>
      {entries.map((entry) => (
        <Fragment key={entry.id}>{entry.row}</Fragment>
      ))}
    </section>
  );
}
