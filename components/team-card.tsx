import type { BalancedTeam } from "@/lib/balance";
import { COMFORT_LABELS, ROLE_LABELS, type Comfort } from "@/lib/types";

const SIDE_STYLES = {
  blue: {
    border: "border-blue-side/40",
    heading: "text-blue-side",
    chip: "bg-blue-side/10 text-blue-side",
  },
  red: {
    border: "border-red-side/40",
    heading: "text-red-side",
    chip: "bg-red-side/10 text-red-side",
  },
} as const;

const COMFORT_TEXT: Record<Comfort, string> = {
  good: "text-good",
  ok: "text-ink-dim",
  bad: "text-bad",
};

export function TeamCard({
  team,
  side,
}: {
  team: BalancedTeam;
  side: "blue" | "red";
}) {
  const styles = SIDE_STYLES[side];

  return (
    <section className={`rounded-lg border bg-panel ${styles.border}`}>
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h3 className={`font-semibold ${styles.heading}`}>
          {side === "blue" ? "Blue side" : "Red side"}
        </h3>
        <p className="text-sm text-ink-dim">
          Power <span className="font-semibold text-ink">{team.totalPower}</span>
        </p>
      </header>

      <ul className="divide-y divide-line">
        {team.assignments.map(({ player, role, comfort }) => (
          <li key={player.id} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-semibold ${styles.chip}`}
            >
              {ROLE_LABELS[role]}
            </span>

            <span className="mr-auto truncate font-medium">{player.name}</span>

            <span className={`text-xs ${COMFORT_TEXT[comfort]}`}>
              {COMFORT_LABELS[comfort]}
            </span>

            <span className="w-6 text-right text-sm text-ink-dim tabular-nums">
              {player.power}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
