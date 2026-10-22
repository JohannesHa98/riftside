import Image from "next/image";
import type { ReactNode } from "react";

import {
  funStats,
  type ChampionTally,
  type PlayerAverage,
  type SingleGameRecord,
} from "@/db/queries";
import { PlayerName } from "@/components/player-name";
import { championIconUrl, championLabel, championNames } from "@/lib/champions";

/** The bits below the ladder: nothing load-bearing, all of it fun. */
export async function OddsAndEnds() {
  const [fun, champions] = await Promise.all([funStats(), championNames()]);

  const hasAnything =
    fun.mostBanned.length > 0 ||
    fun.mostPlayed.length > 0 ||
    fun.records.kills !== null;

  if (!hasAnything) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold text-ink-dim uppercase">
        Odds and ends
      </h2>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card title="Most played">
          <Champions tally={fun.mostPlayed} champions={champions} noun="game" />
        </Card>

        <Card title="Most banned">
          <Champions tally={fun.mostBanned} champions={champions} noun="ban" />
        </Card>

        <Card title="Single-game records">
          <ul className="space-y-1.5">
            <Record label="Kills" record={fun.records.kills} champions={champions} />
            <Record label="Deaths" record={fun.records.deaths} champions={champions} />
            <Record
              label="Assists"
              record={fun.records.assists}
              champions={champions}
            />
            <Record
              label="Damage"
              record={fun.records.damage}
              champions={champions}
              format={(value) => `${Math.round(value / 1000)}k`}
            />
            <Record label="CS" record={fun.records.cs} champions={champions} />
          </ul>
        </Card>

        <Card title="Kills the most" note="per game">
          <Leaders players={fun.leaders.kills} unit="kills" />
        </Card>

        <Card title="Dies the most" note="per game">
          <Leaders players={fun.leaders.deaths} unit="deaths" />
        </Card>

        <Card title="Assists the most" note="per game">
          <Leaders players={fun.leaders.assists} unit="assists" />
        </Card>

        <Card title="Best farmer" note="CS per minute">
          <Leaders players={fun.leaders.csPerMinute} unit="cs/min" />
        </Card>

        <Card title="Which side wins">
          {fun.sides.blue + fun.sides.red === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="flex h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className="bg-blue-side"
                  style={{
                    width: `${(fun.sides.blue / (fun.sides.blue + fun.sides.red)) * 100}%`,
                  }}
                />
                <div className="flex-1 bg-red-side" />
              </div>
              <p className="mt-2 flex justify-between text-sm">
                <span className="text-blue-side">Blue {fun.sides.blue}</span>
                <span className="text-red-side">{fun.sides.red} Red</span>
              </p>
            </>
          )}
        </Card>

        <Card title="Game length">
          {fun.longestGameSeconds === null ? (
            <Empty />
          ) : (
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-baseline gap-2">
                <span className="mr-auto text-ink-dim">Longest</span>
                <span className="font-medium tabular-nums">
                  {minutes(fun.longestGameSeconds)}
                </span>
              </li>
              <li className="flex items-baseline gap-2">
                <span className="mr-auto text-ink-dim">Shortest</span>
                <span className="font-medium tabular-nums">
                  {minutes(fun.shortestGameSeconds)}
                </span>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </section>
  );
}

function Leaders({
  players,
  unit,
}: {
  players: PlayerAverage[];
  unit: string;
}) {
  if (players.length === 0) return <Empty />;

  return (
    <ol className="space-y-1.5">
      {players.map((player) => (
        <li key={player.name} className="flex items-baseline gap-2 text-sm">
          <PlayerName
            name={player.name}
            riotId={player.riotId}
            className="mr-auto truncate"
          />
          <span className="font-medium tabular-nums">
            {player.value.toFixed(1)}
          </span>
          <span className="w-12 shrink-0 text-xs text-ink-dim">{unit}</span>
        </li>
      ))}
    </ol>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note ? <p className="mb-2 text-xs text-ink-dim">{note}</p> : null}
      <div className={note ? "" : "mt-2"}>{children}</div>
    </div>
  );
}

function Champions({
  tally,
  champions,
  noun,
}: {
  tally: ChampionTally[];
  champions: Map<number, string>;
  noun: string;
}) {
  if (tally.length === 0) return <Empty />;

  return (
    <ol className="space-y-1.5">
      {tally.map((entry) => {
        const icon = championIconUrl(entry.championId);
        const name = championLabel(champions, entry.championId);

        return (
          <li key={entry.championId} className="flex items-center gap-2 text-sm">
            {icon === null ? null : (
              <Image
                src={icon}
                alt={name}
                width={20}
                height={20}
                unoptimized
                className="size-5 shrink-0 rounded"
              />
            )}
            <span className="mr-auto truncate">{name}</span>
            <span className="font-medium tabular-nums">{entry.games}</span>
            <span className="text-xs text-ink-dim">
              {entry.games === 1 ? noun : `${noun}s`}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Record({
  label,
  record,
  champions,
  format = (value) => String(value),
}: {
  label: string;
  record: SingleGameRecord | null;
  champions: Map<number, string>;
  format?: (value: number) => string;
}) {
  return (
    <li className="flex items-baseline gap-2 text-sm">
      <span className="w-14 shrink-0 text-xs text-ink-dim">{label}</span>
      {record === null ? (
        <span className="text-ink-dim">—</span>
      ) : (
        <>
          <span className="mr-auto truncate">
            <PlayerName name={record.name} riotId={record.riotId} />
            <span className="ml-1 text-xs text-ink-dim">
              {championLabel(champions, record.championId)}
            </span>
          </span>
          <span className="font-medium tabular-nums">{format(record.value)}</span>
        </>
      )}
    </li>
  );
}

function Empty() {
  return <p className="text-sm text-ink-dim">Nothing tracked yet.</p>;
}

function minutes(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
