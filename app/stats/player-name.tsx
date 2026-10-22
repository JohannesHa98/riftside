import { dpmProfileUrl } from "@/lib/riot-id";

/**
 * A player's name, linked to their dpm.lol profile when we know their Riot
 * ID. Shared so every place a name appears on this page behaves the same.
 */
export function PlayerName({
  name,
  riotId,
  className = "",
}: {
  name: string;
  riotId: string | null;
  className?: string;
}) {
  const profile = dpmProfileUrl(riotId);

  if (profile === null) {
    return <span className={className}>{name}</span>;
  }

  return (
    <a
      href={profile}
      target="_blank"
      rel="noopener noreferrer"
      title={`${name} on dpm.lol`}
      className={`underline decoration-ink-dim/40 underline-offset-2 transition-colors hover:text-gold hover:decoration-gold ${className}`}
    >
      {name}
    </a>
  );
}
