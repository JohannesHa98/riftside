import Link from "next/link";

import { Card } from "@/components/ui";

const SECTIONS = [
  {
    href: "/new-game",
    title: "New game",
    description: "Pick tonight's ten and split them into two even teams.",
  },
  {
    href: "/players",
    title: "Players",
    description: "Power levels and the roles everyone is happy to play.",
  },
  {
    href: "/history",
    title: "History",
    description: "Every game played so far, and who won.",
  },
] as const;

export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        <span className="text-gold">In-house</span> League
      </h1>
      <p className="mt-2 max-w-prose text-ink-dim">
        Pick ten players and get two balanced teams, with a suggested role for
        everyone. The roles are a starting point: sort them out among
        yourselves.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="rounded-lg transition-transform hover:-translate-y-0.5"
          >
            <Card className="h-full hover:border-gold/50">
              <h2 className="font-semibold">{section.title}</h2>
              <p className="mt-1 text-sm text-ink-dim">{section.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
