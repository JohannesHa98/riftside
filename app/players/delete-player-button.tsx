"use client";

import { useTransition } from "react";

import { buttonStyles } from "@/components/ui";

import { deletePlayer } from "./actions";

export function DeletePlayerButton({ id, name }: { id: number; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className={buttonStyles.danger}
      onClick={() => {
        const confirmed = window.confirm(
          `Remove ${name}? If they have already played a game they are retired instead, so past games keep their rosters.`,
        );
        if (!confirmed) return;

        startTransition(async () => {
          await deletePlayer(id);
        });
      }}
    >
      {pending ? "Removing…" : "Remove"}
    </button>
  );
}
