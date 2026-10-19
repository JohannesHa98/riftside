"use client";

import { useState, useTransition } from "react";

import { buttonStyles } from "@/components/ui";
import type { BalancedTeam, Suggestion } from "@/lib/balance";
import type { Team } from "@/lib/types";

import { saveMatch, type MatchSlot } from "./actions";

function slotsOf(team: BalancedTeam): MatchSlot[] {
  return team.assignments.map((assignment) => ({
    playerId: assignment.player.id,
    role: assignment.role,
  }));
}

export function SaveTeams({ suggestion }: { suggestion: Suggestion }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function save(winner: Team | null) {
    setError(null);
    startTransition(async () => {
      try {
        await saveMatch({
          blue: slotsOf(suggestion.blue),
          red: slotsOf(suggestion.red),
          winner,
        });
      } catch (problem) {
        // redirect() throws by design; let it through.
        if (problem instanceof Error && problem.message.includes("NEXT_REDIRECT")) {
          throw problem;
        }
        setError("Could not save that game. Try again.");
      }
    });
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h3 className="text-xs font-semibold text-ink-dim uppercase">Save this game</h3>
      <p className="mt-1 text-sm text-ink-dim">
        Record the winner now, or save the teams and fill the result in from
        History once you have played.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => save("blue")}
          className={`${buttonStyles.secondary} border-blue-side/40 text-blue-side`}
        >
          Blue won
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save("red")}
          className={`${buttonStyles.secondary} border-red-side/40 text-red-side`}
        >
          Red won
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => save(null)}
          className={buttonStyles.secondary}
        >
          Save without a result
        </button>
      </div>

      {error ? <p className="mt-2 text-sm text-bad">{error}</p> : null}
    </div>
  );
}
