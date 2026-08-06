export class Cooldown {
  readonly #durationMs: number;
  readonly #lastUseByKey = new Map<string, number>();

  public constructor(durationSeconds: number) {
    this.#durationMs = durationSeconds * 1_000;
  }

  public consume(key: string, now = Date.now()): number {
    if (this.#durationMs === 0) {
      return 0;
    }

    const lastUse = this.#lastUseByKey.get(key);
    if (lastUse !== undefined) {
      const remainingMs = this.#durationMs - (now - lastUse);
      if (remainingMs > 0) {
        return Math.ceil(remainingMs / 1_000);
      }
    }

    this.#lastUseByKey.set(key, now);
    return 0;
  }

  public clear(key: string): void {
    this.#lastUseByKey.delete(key);
  }
}
