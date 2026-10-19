import type { ReactNode } from "react";

/** Shared button looks, used on both buttons and links. */
export const buttonStyles = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-md bg-gold px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-gold/85 disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-md border border-line bg-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-ink-dim disabled:opacity-50",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-md border border-bad/40 px-3 py-2 text-sm font-medium text-bad transition-colors hover:bg-bad/10 disabled:opacity-50",
} as const;

export const inputStyles =
  "w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus:border-gold focus:outline-none";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-ink-dim">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-line bg-panel p-4 ${className}`}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-10 text-center text-sm text-ink-dim">
      {children}
    </div>
  );
}
