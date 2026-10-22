import { readFile, writeFile } from "node:fs/promises";

/**
 * Remembers which games have already been sent, so restarting the companion
 * or running a backfill does not send anything twice.
 *
 * The website is idempotent on game id as well — this is the cheap first line,
 * not the only one.
 */
export class SentStore {
  readonly path: string;
  private sent: Set<number>;

  constructor(path: string) {
    this.path = path;
    this.sent = new Set();
  }

  async load(): Promise<void> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      const ids = (parsed as { gameIds?: unknown })?.gameIds;
      this.sent = new Set(
        Array.isArray(ids) ? ids.filter((id): id is number => typeof id === "number") : [],
      );
    } catch {
      // Missing or unreadable: start empty rather than refuse to run. The
      // website will reject anything that really is a duplicate.
      this.sent = new Set();
    }
  }

  has(gameId: number): boolean {
    return this.sent.has(gameId);
  }

  get size(): number {
    return this.sent.size;
  }

  async add(gameId: number): Promise<void> {
    this.sent.add(gameId);
    await this.save();
  }

  private async save(): Promise<void> {
    const ids = [...this.sent].sort((a, b) => a - b);
    await writeFile(this.path, JSON.stringify({ gameIds: ids }, null, 2), "utf8");
  }
}
