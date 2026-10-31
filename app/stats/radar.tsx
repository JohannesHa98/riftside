import type { SpotlightAxis } from "@/db/queries";

/** Formatting lives here rather than with the data, so the axes stay plain. */
export function formatAxis(key: string, value: number): string {
  switch (key) {
    case "survival":
      return `${value.toFixed(1)} deaths`;
    case "farming":
      return `${value.toFixed(1)} cs/min`;
    case "vision":
      return `${value.toFixed(1)} vis/min`;
    case "damage":
      return `${Math.round(value)}/min`;
    case "winRate":
      return `${Math.round(value * 100)}%`;
    default:
      return value.toFixed(1);
  }
}

/*
 * Wider than it is tall: the rings take the middle, and the rest is room for
 * labels carrying a figure and its placing.
 */
const WIDTH = 380;
const HEIGHT = 320;
const CENTRE_X = WIDTH / 2;
const CENTRE_Y = HEIGHT / 2;
const RADIUS = 88;
/** The gap every label keeps from the outer ring, whatever its size. */
const LABEL_GAP = 14;
/** Roughly how wide a character is at the size the figures are set in. */
const CHAR_WIDTH = 5.9;
/** How far the ink of a line reaches above and below its own baseline. */
const ASCENT = 6.5;
const DESCENT = 2.5;
const RINGS = [0.25, 0.5, 0.75, 1];
/** One line of label text, in viewBox units. */
const LINE_HEIGHT = 11;

/** Start at the top and go clockwise. */
function angleOf(axis: number, count: number): number {
  return (Math.PI * 2 * axis) / count - Math.PI / 2;
}

function pointAt(axis: number, count: number, distance: number) {
  const angle = angleOf(axis, count);
  return {
    x: CENTRE_X + Math.cos(angle) * RADIUS * distance,
    y: CENTRE_Y + Math.sin(angle) * RADIUS * distance,
  };
}

/**
 * Where an axis's label sits — pushed out by its own size, so every one of
 * them keeps the same gap from the rings.
 *
 * A label is centred on its axis, which means half of it points back at the
 * chart: a wide one needs to stand further off than a narrow one, and one
 * above the chart needs less room than one beside it, because it is only a
 * few lines tall. Both fall out of projecting the label's own half-width and
 * half-height onto the direction its axis runs in.
 */
function labelAt(axis: number, count: number, lines: string[]) {
  const angle = angleOf(axis, count);

  const widest = Math.max(...lines.map((line) => line.length));
  const halfWidth = (widest * CHAR_WIDTH) / 2;
  const halfHeight = (lines.length * LINE_HEIGHT) / 2;

  // How far from the label's centre its own edge is, along the axis: the
  // first edge the axis line crosses, which is the side for a label beside
  // the chart and the top for one below it. Adding both — as projecting the
  // width and the height separately does — pushes a label out by an edge the
  // axis never reaches, which is what left Survival and Damage adrift.
  const toEdge = Math.min(
    Math.abs(halfWidth / Math.cos(angle)),
    Math.abs(halfHeight / Math.sin(angle)),
  );

  const reach = RADIUS + LABEL_GAP + toEdge;

  const centreY = CENTRE_Y + Math.sin(angle) * reach;

  // Centre the ink, not the baselines. A text block grows downwards from its
  // first baseline, so placing that baseline on the point leaves the block
  // hanging below it — which reads as a wide gap under the chart and a tight
  // one above it, the same labels at the same distance looking uneven.
  const inkDrop = ((lines.length - 1) * LINE_HEIGHT + DESCENT - ASCENT) / 2;

  return {
    x: CENTRE_X + Math.cos(angle) * reach,
    y: centreY - inkDrop,
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

/** The player the chart is about: scaled values, and what they really were. */
export interface RadarSubject {
  name: string;
  /** One 0-1 value per axis. */
  values: number[];
  /** The same axes unscaled, for the labels. */
  raw: number[];
  /** Where each figure places among everyone measured that way: "1st". */
  places?: string[];
}

/**
 * What the subject is read against: the group's average shape, or a second
 * player. The two are drawn differently on purpose — see below.
 */
export interface RadarContext {
  name: string;
  values: number[];
  /** True when this is another player rather than the group. */
  rival: boolean;
  raw?: number[];
  places?: string[];
}

/**
 * One player's shape, drawn against something.
 *
 * Against the group's average this is an *emphasis* chart: the player is the
 * subject in the accent colour and the group is recessive context, a dashed
 * outline with no fill. Against another player it is a *categorical* one —
 * two equals — so the second shape gets its own colour, checked against the
 * first for colour blindness, and the same weight rather than being pushed
 * into the background.
 *
 * Either way every axis carries its value as text, so the chart is readable
 * without comparing areas by eye and without hovering.
 */
export function Radar({
  axes,
  subject,
  context,
}: {
  axes: SpotlightAxis[];
  subject: RadarSubject;
  context: RadarContext;
}) {
  const described = context.rival
    ? `${subject.name} against ${context.name}`
    : `${subject.name}'s profile`;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full max-w-96"
        role="img"
        aria-label={`${described} across ${axes.map((a) => a.label).join(", ")}`}
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
              x1={CENTRE_X}
              y1={CENTRE_Y}
              x2={x}
              y2={y}
              className="stroke-line"
              strokeWidth={1}
            />
          );
        })}

        {/* The context first, so the subject sits on top of it. */}
        <polygon
          points={polygon(context.values)}
          className={
            context.rival
              ? "fill-blue-side/15 stroke-blue-side"
              : "fill-none stroke-chart-context"
          }
          strokeWidth={2}
          strokeDasharray={context.rival ? undefined : "5 4"}
          strokeLinejoin="round"
        />

        <polygon
          points={polygon(subject.values)}
          className="fill-gold/20 stroke-gold"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {axes.map((axis, index) => {
          // Every line the label will hold, so it can be placed by its size.
          const lines = [
            axis.label,
            formatAxis(axis.key, subject.raw[index]) + (subject.places?.[index] ?? ""),
            ...(context.rival && context.raw !== undefined
              ? [formatAxis(axis.key, context.raw[index]) + (context.places?.[index] ?? "")]
              : []),
          ];
          const { x, y } = labelAt(index, axes.length, lines);

          return (
            <text key={axis.key} x={x} y={y} textAnchor="middle" className="text-[9px]">
              <tspan className="fill-ink-dim uppercase">{axis.label}</tspan>
              <tspan
                x={x}
                dy={LINE_HEIGHT}
                className="fill-ink text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
              >
                {formatAxis(axis.key, subject.raw[index])}
                {subject.places?.[index] === undefined ? null : (
                  <tspan className="fill-ink-dim text-[9px] font-normal">
                    {` (${subject.places[index]})`}
                  </tspan>
                )}
              </tspan>
              {context.rival && context.raw !== undefined ? (
                <tspan
                  x={x}
                  dy={LINE_HEIGHT}
                  className="fill-blue-side text-[11px] font-semibold [font-variant-numeric:tabular-nums]"
                >
                  {formatAxis(axis.key, context.raw[index])}
                  {context.places?.[index] === undefined ? null : (
                    <tspan className="fill-ink-dim text-[9px] font-normal">
                      {` (${context.places[index]})`}
                    </tspan>
                  )}
                </tspan>
              ) : null}
            </text>
          );
        })}

        {subject.values.map((value, index) => {
          const { x, y } = pointAt(index, subject.values.length, value);
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

export function RadarLegend({
  subject,
  context,
}: {
  subject: string;
  context: RadarContext;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-dim">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="h-0.5 w-5 rounded-full bg-gold" />
        {subject}
      </span>
      <span className="flex items-center gap-1.5">
        {context.rival ? (
          <span aria-hidden className="h-0.5 w-5 rounded-full bg-blue-side" />
        ) : (
          <span
            aria-hidden
            className="w-5 border-t-2 border-dashed border-chart-context"
          />
        )}
        {context.name}
      </span>
    </div>
  );
}
