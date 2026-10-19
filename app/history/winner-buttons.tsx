"use client";

import { useTransition } from "react";

import type { Team } from "@/lib/types";

import { setWinner } from "./actions";

const SIDE_STYLES = {
  blue: "border-blue-side/40 text-blue-side hover:bg-blue-side/10",
  red: "border-red-side/40 text-red-side hover:bg-red-side/10",
} as const;

export function WinnerButtons({
  matchId,
  winner,
}: {
  matchId: number;
  winner: Team | null;
}) {
  const [pending, startTransition] = useTransition();

  function record(side: Team | null) {
    startTransition(async () => {
      await setWinner(matchId, side);
    });
  }

  if (winner !== null) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => record(null)}
        className="text-xs text-ink-dim underline disabled:opacity-50"
      >
        Clear result
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-ink-dim">Who won?</span>
      {(["blue", "red"] as const).map((side) => (
        <button
          key={side}
          type="button"
          disabled={pending}
          onClick={() => record(side)}
          className={`rounded border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${SIDE_STYLES[side]}`}
        >
          {side === "blue" ? "Blue" : "Red"}
        </button>
      ))}
    </div>
  );
}
