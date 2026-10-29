import type { PlayerProfile, SpotlightAxis } from "@/db/queries";

/** Formatting lives here rather than with the data, so the axes stay plain. */
export function formatAxis(key: string, value: number): string {
  switch (key) {
    case "survival":
      return `${value.toFixed(1)} deaths`;
    case "farming":
      return `${value.toFixed(1)} cs/min`;
    case "damage":
      return `${Math.round(value)}/min`;
    case "winRate":
      return `${Math.round(value * 100)}%`;
    default:
      return value.toFixed(1);
  }
}

const SIZE = 300;
const CENTRE = SIZE / 2;
const RADIUS = 88;
/** Where the axis labels sit, just outside the outer ring. */
const LABEL_DISTANCE = 1.18;
const RINGS = [0.25, 0.5, 0.75, 1];

function pointAt(axis: number, count: number, distance: number) {
  // Start at the top and go clockwise.
  const angle = (Math.PI * 2 * axis) / count - Math.PI / 2;
  return {
    x: CENTRE + Math.cos(angle) * RADIUS * distance,
    y: CENTRE + Math.sin(angle) * RADIUS * distance,
  };
}

function polygon(values: number[]): string {
  return values
    .map((value, axis) => {
      const { x, y } = pointAt(axis, values.length, value);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * A six-axis radar: one player against the group's average shape.
 *
 * This is an emphasis chart, not a categorical one — the player is the
 * subject in the accent colour and the group is recessive context, drawn as a
 * dashed outline with no fill. Every axis carries its own value as text, so
 * the chart is readable without comparing areas by eye and without hovering.
 */
export function Radar({
  player,
  average,
  axes,
}: {
  player: PlayerProfile;
  average: number[];
  axes: SpotlightAxis[];
}) {
  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full max-w-80"
        role="img"
        aria-label={`${player.name}'s profile across ${axes.map((a) => a.label).join(", ")}`}
      >
        {RINGS.map((ring) => (
          <polygon
            key={ring}
            points={polygon(axes.map(() => ring))}
            className="fill-none stroke-line"
            strokeWidth={1}
          />
        ))}

        {axes.map((axis, index) => {
          const { x, y } = pointAt(index, axes.length, 1);
          return (
            <line
              key={axis.key}
              x1={CENTRE}
              y1={CENTRE}
              x2={x}
              y2={y}
              className="stroke-line"
              strokeWidth={1}
            />
          );
        })}

        {/* The group first, so the player sits on top of it. */}
        <polygon
          points={polygon(average)}
          className="fill-none stroke-chart-context"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />

        <polygon
          points={polygon(player.radar)}
          className="fill-gold/20 stroke-gold"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {axes.map((axis, index) => {
          const { x, y } = pointAt(index, axes.length, LABEL_DISTANCE);
          // Anchor by which side of the circle the label is on, so nothing
          // runs back over the chart.
          const anchor = x < CENTRE - 1 ? "end" : x > CENTRE + 1 ? "start" : "middle";

          return (
            <text key={axis.key} x={x} y={y} textAnchor={anchor} className="text-[9px]">
              <tspan className="fill-ink-dim uppercase">{axis.label}</tspan>
              <tspan
                x={x}
                dy="11"
                className="fill-ink text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
              >
                {formatAxis(axis.key, player.raw[index])}
              </tspan>
            </text>
          );
        })}

        {player.radar.map((value, index) => {
          const { x, y } = pointAt(index, player.radar.length, value);
          return (
            <circle
              key={axes[index].key}
              cx={x}
              cy={y}
              r={3.5}
              className="fill-gold stroke-panel"
              strokeWidth={2}
            />
          );
        })}
      </svg>

    </figure>
  );
}

export function RadarLegend({ name }: { name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-dim">
      <span className="flex items-center gap-1.5">
        <span className="h-0.5 w-5 rounded-full bg-gold" />
        {name}
      </span>
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="w-5 border-t-2 border-dashed border-chart-context"
        />
        Everyone&rsquo;s average
      </span>
    </div>
  );
}
