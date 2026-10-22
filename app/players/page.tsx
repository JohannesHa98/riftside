import { Suspense } from "react";

import { ComfortBadge } from "@/components/comfort-badge";
import { PlayerName } from "@/components/player-name";
import { EmptyState, PageHeader } from "@/components/ui";
import { listPlayers } from "@/db/queries";
import type { Player } from "@/db/schema";
import { isSignedIn } from "@/lib/auth";
import { comfortOf } from "@/lib/player";
import { ROLES } from "@/lib/types";

import { createPlayer, updatePlayer } from "./actions";
import { DeletePlayerButton } from "./delete-player-button";
import { PlayerForm } from "./player-form";

export default function PlayersPage() {
  return (
    <div>
      <PageHeader
        title="Players"
        description="Power is how good someone is overall. The roles they will play only decide who goes where."
      />

      <Suspense fallback={<RosterSkeleton />}>
        <Roster />
      </Suspense>
    </div>
  );
}

async function Roster() {
  const [everyone, canEdit] = await Promise.all([listPlayers(), isSignedIn()]);

  const active = everyone.filter((player) => !player.archived);
  const retired = everyone.filter((player) => player.archived);

  return (
    <>
      {canEdit ? (
        <details className="mb-6 rounded-lg border border-line bg-panel">
          <summary className="list-none px-4 py-3 text-sm font-semibold select-none">
            + Add player
          </summary>
          <div className="border-t border-line p-4">
            <PlayerForm
              action={createPlayer}
              submitLabel="Add player"
              resetOnSuccess
            />
          </div>
        </details>
      ) : null}

      {everyone.length === 0 ? (
        <EmptyState>
          {canEdit ? "No players yet. Add the first one above." : "No players yet."}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <section className="space-y-2">
            <h2 className="text-xs font-semibold text-ink-dim uppercase">
              {active.length} active
            </h2>
            {active.length === 0 ? (
              <EmptyState>Everyone is retired.</EmptyState>
            ) : (
              active.map((player) => (
                <PlayerRow key={player.id} player={player} canEdit={canEdit} />
              ))
            )}
          </section>

          {retired.length > 0 ? (
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-ink-dim uppercase">
                {retired.length} retired
              </h2>
              {retired.map((player) => (
                <PlayerRow key={player.id} player={player} canEdit={canEdit} />
              ))}
            </section>
          ) : null}
        </div>
      )}
    </>
  );
}

function PlayerRow({ player, canEdit }: { player: Player; canEdit: boolean }) {
  const shell = `rounded-lg border border-line bg-panel ${
    player.archived ? "opacity-60" : ""
  }`;
  const row = "flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3";

  const summary = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-sm font-semibold text-gold">
        {player.power}
      </span>

      {/*
        Signed in, the whole row is the toggle that opens the editor, so a
        link in the middle of it would fight the click. Signed out there is
        nothing to open, so the name becomes the profile link.
      */}
      {canEdit ? (
        <span className="mr-auto font-medium">{player.name}</span>
      ) : (
        <PlayerName
          name={player.name}
          riotId={player.riotId}
          className="mr-auto font-medium"
        />
      )}

      <span className="flex flex-wrap gap-1">
        {ROLES.map((role) => (
          <ComfortBadge key={role} role={role} comfort={comfortOf(player, role)} />
        ))}
      </span>
    </>
  );

  if (!canEdit) {
    return (
      <div className={shell}>
        <div className={row}>{summary}</div>
      </div>
    );
  }

  const updateThisPlayer = updatePlayer.bind(null, player.id);

  return (
    <details className={`group ${shell}`}>
      <summary className={`${row} list-none select-none`}>
        {summary}
        <span className="text-xs text-ink-dim group-open:hidden">Edit</span>
      </summary>

      <div className="border-t border-line p-4">
        <PlayerForm
          action={updateThisPlayer}
          player={player}
          submitLabel="Save changes"
          extraActions={<DeletePlayerButton id={player.id} name={player.name} />}
        />
      </div>
    </details>
  );
}

function RosterSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse rounded-lg border border-line bg-panel/60"
        />
      ))}
    </div>
  );
}
