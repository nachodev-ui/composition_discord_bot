import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildConfigSchema, type AlbionBuild, type BuildConfig } from '../domain/build.js';
import { BotConfigurationError } from '../domain/errors.js';
import type { BuildApiClient } from './buildApiClient.js';

export class BuildCatalog {
  #description: string;
  #version: number;
  #byNumber = new Map<number, AlbionBuild>();
  readonly #apiClient: BuildApiClient | null;

  private constructor(config: BuildConfig, apiClient: BuildApiClient | null = null) {
    this.#description = config.description;
    this.#version = config.version;
    this.#apiClient = apiClient;
    this.#replace(config.builds);
  }

  public static load(configPath: string): BuildCatalog {
    const absolutePath = resolve(process.cwd(), configPath);
    try {
      const rawConfig: unknown = JSON.parse(readFileSync(absolutePath, 'utf8'));
      return new BuildCatalog(buildConfigSchema.parse(rawConfig));
    } catch (error) {
      throw new BotConfigurationError(`No se pudo cargar una configuración válida desde ${absolutePath}.`, { cause: error });
    }
  }

  public static async fromApi(apiClient: BuildApiClient): Promise<BuildCatalog> {
    const builds = await apiClient.listBuilds();
    return new BuildCatalog({
      version: Math.max(1, ...builds.map((build) => build.version)),
      description: 'Builds sincronizadas desde PostgreSQL mediante la API interna.',
      builds,
    }, apiClient);
  }

  public async refresh(): Promise<void> {
    if (!this.#apiClient) return;
    const builds = await this.#apiClient.listBuilds();
    this.#replace(builds);
    this.#version = Math.max(1, ...builds.map((build) => build.version));
  }

  public get description(): string {
    return this.#description;
  }

  public get version(): number {
    return this.#version;
  }

  public get all(): readonly AlbionBuild[] {
    return [...this.#byNumber.values()].sort((left, right) => left.number - right.number);
  }

  public getByNumber(number: number): AlbionBuild | undefined {
    return this.#byNumber.get(number);
  }

  public has(number: number): boolean {
    return this.#byNumber.has(number);
  }

  #replace(builds: readonly AlbionBuild[]): void {
    this.#byNumber = new Map(
      builds
        .filter((build) => build.enabled && build.status !== 'archived' && build.status !== 'draft')
        .map((build) => [build.number, build]),
    );
  }
}
