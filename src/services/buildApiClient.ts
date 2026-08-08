import { z } from 'zod';
import { buildSchema, type AlbionBuild } from '../domain/build.js';

const buildListSchema = z.array(buildSchema);

export class BuildApiClient {
  readonly #baseUrl: string;

  public constructor(baseUrl: string) {
    this.#baseUrl = baseUrl.replace(/\/$/u, '');
  }

  public async listBuilds(): Promise<AlbionBuild[]> {
    const response = await fetch(`${this.#baseUrl}/api/v1/builds`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`La API de builds respondió HTTP ${response.status}.`);
    }
    return buildListSchema.parse(await response.json());
  }

  public async getBuildByNumber(number: number): Promise<AlbionBuild | null> {
    const response = await fetch(`${this.#baseUrl}/api/v1/builds/${number}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`La API de builds respondió HTTP ${response.status}.`);
    return buildSchema.parse(await response.json());
  }
}
