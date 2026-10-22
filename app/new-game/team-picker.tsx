"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ComfortBadge } from "@/components/comfort-badge";
import { TeamCard } from "@/components/team-card";
import {
  PLAYERS_PER_GAME,
  SUGGESTION_COUNT,
  enumerateSplits,
  rankSplits,
  type BalancePlayer,
  type Suggestion,
} from "@/lib/balance";
import { ROLES } from "@/lib/types";

import { SaveTeams } from "./save-teams";

export function TeamPicker({
  roster,
  canEdit,
}: {
  roster: BalancePlayer[];
  canEdit: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const teamsRef = useRef<HTMLDivElement>(null);
  const suggestionsRef = useRef<HTMLElement>(null);

  // The teams appear below the whole player list, so opening a suggestion
  // can leave them off-screen entirely. Bring them into view.
  useEffect(() => {
    if (chosen === null) return;

    teamsRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, [chosen]);

  const selected = useMemo(
    () => roster.filter((player) => selectedIds.includes(player.id)),
    [roster, selectedIds],
  );

  const ready = selected.length === PLAYERS_PER_GAME;

  // On a phone the player list fills several screens, so the suggestions
  // appear far below the tenth tick and it looks as though nothing happened.
  // On a wider screen they are already in view, so leave the page alone.
  useEffect(() => {
    if (!ready) return;
    if (!window.matchMedia("(max-width: 639px)").matches) return;

    suggestionsRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "start",
    });
  }, [ready]);

  // Pure and tiny (126 splits), so it runs here rather than on the server.
  const ranked = useMemo(
    () => (ready ? rankSplits(enumerateSplits(selected)) : []),
    [ready, selected],
  );

  const pageCount = Math.max(1, Math.ceil(ranked.length / SUGGESTION_COUNT));
  const safePage = page % pageCount;
  const shown = ranked.slice(
    safePage * SUGGESTION_COUNT,
    safePage * SUGGESTION_COUNT + SUGGESTION_COUNT,
  );

  function toggle(id: number) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((other) => other !== id)
        : current.length >= PLAYERS_PER_GAME
          ? current
          : [...current, id],
    );
    setChosen(null);
    setPage(0);
  }

  function reset() {
    setSelectedIds([]);
    setChosen(null);
    setPage(0);
  }

  const chosenSuggestion = chosen === null ? null : ranked[chosen];

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-semibold text-ink-dim uppercase">
            Who is playing
          </h2>
          <p className="text-sm">
            <span className={ready ? "font-semibold text-gold" : "font-semibold"}>
              {selected.length}
            </span>
            <span className="text-ink-dim"> / {PLAYERS_PER_GAME} picked</span>
          </p>
        </div>

        {/*
          CSS columns rather than a grid: a grid fills left-right, so a
          power-ordered roster would read 10 10 / 9 9 across the rows. Columns
          flow top-to-bottom, so the left column runs straight down the
          ranking and the right column carries on from the bottom of it.
        */}
        <div className="columns-1 gap-2 sm:columns-2">
          {roster.map((player) => {
            const isSelected = selectedIds.includes(player.id);
            const full = !isSelected && selected.length >= PLAYERS_PER_GAME;

            return (
              <label
                key={player.id}
                className={`mb-2 flex break-inside-avoid items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  isSelected
                    ? "border-gold/50 bg-gold/5"
                    : "border-line bg-panel hover:border-ink-dim/50"
                } ${full ? "opacity-40" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={full}
                  onChange={() => toggle(player.id)}
                  className="size-4 shrink-0 accent-gold"
                />

                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-xs font-semibold text-gold">
                  {player.power}
                </span>

                <span className="mr-auto truncate text-sm font-medium">
                  {player.name}
                </span>

                <span className="hidden gap-1 sm:flex">
                  {ROLES.map((role) => (
                    <ComfortBadge
                      key={role}
                      role={role}
                      comfort={player.comfort[role]}
                    />
                  ))}
                </span>
              </label>
            );
          })}
        </div>

        {selected.length > 0 ? (
          <button type="button" onClick={reset} className="mt-3 text-sm text-ink-dim underline">
            Clear selection
          </button>
        ) : null}
      </section>

      {ready ? (
        <section ref={suggestionsRef} className="scroll-mt-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xs font-semibold text-ink-dim uppercase">
              Suggestions
            </h2>

            {ranked.length > SUGGESTION_COUNT ? (
              <button
                type="button"
                onClick={() => {
                  setPage((current) => current + 1);
                  setChosen(null);
                }}
                className="text-sm text-gold underline"
              >
                Reroll ({safePage + 1} of {pageCount})
              </button>
            ) : null}
          </div>

          <div className="space-y-2">
            {shown.map((suggestion, offset) => {
              const index = safePage * SUGGESTION_COUNT + offset;

              return (
                <SuggestionRow
                  key={index}
                  suggestion={suggestion}
                  rank={index + 1}
                  active={chosen === index}
                  onSelect={() => setChosen(chosen === index ? null : index)}
                />
              );
            })}
          </div>

          {ranked.length === 1 ? (
            <p className="mt-2 text-xs text-ink-dim">
              Only one split avoids putting someone on a role they never play.
            </p>
          ) : null}
        </section>
      ) : null}

      {chosenSuggestion ? (
        // scroll-mt leaves a little of the page above the teams, so they do
        // not land flush against the top edge.
        <div ref={teamsRef} className="scroll-mt-4 space-y-6">
          <section className="grid gap-3 sm:grid-cols-2">
            <TeamCard team={chosenSuggestion.blue} side="blue" />
            <TeamCard team={chosenSuggestion.red} side="red" />
          </section>

          {canEdit ? <SaveTeams suggestion={chosenSuggestion} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function SuggestionRow({
  suggestion,
  rank,
  active,
  onSelect,
}: {
  suggestion: Suggestion;
  rank: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`flex w-full flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border px-4 py-3 text-left transition-colors ${
        active ? "border-gold/60 bg-gold/5" : "border-line bg-panel hover:border-ink-dim/50"
      }`}
    >
      <span className="text-sm font-semibold">#{rank}</span>

      <span className="text-sm">
        <span className="text-blue-side">{suggestion.blue.totalPower}</span>
        <span className="text-ink-dim"> v </span>
        <span className="text-red-side">{suggestion.red.totalPower}</span>
      </span>

      <span className="text-xs text-ink-dim">
        {suggestion.powerDifference === 0
          ? "dead even"
          : `${suggestion.powerDifference} apart`}
      </span>

      <span className="ml-auto text-xs">
        <span className="text-good">{suggestion.goodCount} on main</span>
        {suggestion.badCount > 0 ? (
          <span className="text-bad"> · {suggestion.badCount} never</span>
        ) : null}
      </span>

      <span className="text-xs text-ink-dim">{active ? "Hide" : "Show teams"}</span>
    </button>
  );
}
