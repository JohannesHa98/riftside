"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";

import type { Player } from "@/db/schema";
import { comfortOf } from "@/lib/player";
import {
  COMFORTS,
  COMFORT_LABELS,
  MAX_POWER,
  MIN_POWER,
  ROLES,
  ROLE_LABELS,
  type Comfort,
} from "@/lib/types";
import { buttonStyles, inputStyles } from "@/components/ui";

import type { PlayerFormState } from "./actions";

const POWER_LEVELS = Array.from(
  { length: MAX_POWER - MIN_POWER + 1 },
  (_, i) => MIN_POWER + i,
);

const COMFORT_STYLES: Record<Comfort, string> = {
  good: "peer-checked:border-good/50 peer-checked:bg-good/15 peer-checked:text-good",
  ok: "peer-checked:border-okay/50 peer-checked:bg-okay/15 peer-checked:text-okay",
  bad: "peer-checked:border-bad/50 peer-checked:bg-bad/15 peer-checked:text-bad",
};

export function PlayerForm({
  action,
  player,
  submitLabel,
  resetOnSuccess = false,
  extraActions,
}: {
  action: (state: PlayerFormState, formData: FormData) => Promise<PlayerFormState>;
  player?: Player;
  submitLabel: string;
  resetOnSuccess?: boolean;
  extraActions?: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  const succeeded = state !== null && "ok" in state;

  useEffect(() => {
    if (succeeded && resetOnSuccess) formRef.current?.reset();
  }, [succeeded, state, resetOnSuccess]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-dim uppercase">
            Name
          </span>
          <input
            name="name"
            type="text"
            required
            maxLength={40}
            autoComplete="off"
            defaultValue={player?.name ?? ""}
            placeholder="Summoner name"
            className={inputStyles}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-dim uppercase">
            Power
          </span>
          <select
            name="power"
            defaultValue={player?.power ?? 5}
            className={`${inputStyles} sm:w-24`}
          >
            {POWER_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-medium text-ink-dim uppercase">
          Role preference
        </legend>

        <div className="space-y-2">
          {ROLES.map((role) => {
            const current = player ? comfortOf(player, role) : "ok";

            return (
              <div
                key={role}
                className="flex items-center justify-between gap-3 rounded-md bg-surface/60 px-3 py-2"
              >
                <span className="text-sm font-medium">{ROLE_LABELS[role]}</span>

                <div className="flex gap-1">
                  {COMFORTS.map((comfort) => (
                    <label key={comfort}>
                      <input
                        type="radio"
                        name={role}
                        value={comfort}
                        defaultChecked={current === comfort}
                        className="peer sr-only"
                      />
                      <span
                        className={`block rounded border border-line px-2.5 py-1 text-xs font-medium text-ink-dim transition-colors ${COMFORT_STYLES[comfort]}`}
                      >
                        {COMFORT_LABELS[comfort]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </fieldset>

      {player ? (
        <label className="flex items-center gap-2 text-sm text-ink-dim">
          <input
            type="checkbox"
            name="archived"
            defaultChecked={player.archived}
            className="size-4 accent-gold"
          />
          Retired (hidden when picking teams)
        </label>
      ) : null}

      {state !== null && "error" in state ? (
        <p className="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={buttonStyles.primary}>
          {pending ? "Saving…" : submitLabel}
        </button>
        {extraActions}
        {succeeded && !resetOnSuccess ? (
          <span className="text-sm text-good">Saved</span>
        ) : null}
      </div>
    </form>
  );
}
