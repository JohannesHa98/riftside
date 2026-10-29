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
    description: "Power levels and role preferences for everyone in the group.",
  },
  {
    href: "/history",
    title: "History",
    description: "Every game played so far, and who won.",
  },
  {
    href: "/stats",
    title: "Stats",
    description: "Games, win rate, KDA and who plays what.",
  },
] as const;

export default function HomePage() {
  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        <span className="text-gold">Rift</span>side
      </h1>
      <p className="mt-2 max-w-prose text-ink-dim">
        Pick ten players and get two balanced teams, with a suggested role for
        everyone. The roles are a starting point: sort them out among
        yourselves.
      </p>

      {/*
        auto-rows-fr makes every row as tall as its tallest card, so a card
        with a longer description does not stand taller than the rest — which
        is most obvious on a phone, where each card is its own row.
      */}
      <div className="mt-8 grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="h-full rounded-lg transition-transform hover:-translate-y-0.5"
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
