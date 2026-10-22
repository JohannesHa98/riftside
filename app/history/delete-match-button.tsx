"use client";

import { useTransition } from "react";

import { buttonStyles } from "@/components/ui";

import { deleteMatch } from "./actions";

export function DeleteMatchButton({
  matchId,
  playedAt,
}: {
  matchId: number;
  playedAt: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className={buttonStyles.danger}
      onClick={() => {
        const confirmed = window.confirm(
          `Delete the game from ${playedAt}? Its line-ups and stats go with it, and there is no undo.`,
        );
        if (!confirmed) return;

        startTransition(async () => {
          await deleteMatch(matchId);
        });
      }}
    >
      {pending ? "Deleting…" : "Delete game"}
    </button>
  );
}
