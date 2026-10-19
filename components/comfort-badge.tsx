import type { Comfort, Role } from "@/lib/types";
import { COMFORT_LABELS, ROLE_LABELS } from "@/lib/types";

const COMFORT_TONE: Record<Comfort, string> = {
  good: "border-good/40 bg-good/10 text-good",
  ok: "border-line bg-raised text-ink-dim",
  bad: "border-bad/40 bg-bad/10 text-bad",
};

/** A role with the player's comfort on it, colour-coded. */
export function ComfortBadge({
  role,
  comfort,
  showComfort = false,
}: {
  role: Role;
  comfort: Comfort;
  showComfort?: boolean;
}) {
  return (
    <span
      title={`${ROLE_LABELS[role]}: ${COMFORT_LABELS[comfort]}`}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${COMFORT_TONE[comfort]}`}
    >
      {ROLE_LABELS[role]}
      {showComfort ? (
        <span className="opacity-70">{COMFORT_LABELS[comfort]}</span>
      ) : null}
    </span>
  );
}
