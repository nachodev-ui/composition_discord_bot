import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildConfigSchema, type AlbionBuild, type BuildConfig } from '../domain/build.js';
import { BotConfigurationError } from '../domain/errors.js';

export class BuildCatalog {
  readonly #config: BuildConfig;
  readonly #byNumber: ReadonlyMap<number, AlbionBuild>;

  private constructor(config: BuildConfig) {
    this.#config = config;
    this.#byNumber = new Map(
      config.builds.filter((build) => build.enabled).map((build) => [build.number, build]),
    );
  }

  public static load(configPath: string): BuildCatalog {
    const absolutePath = resolve(process.cwd(), configPath);

    try {
      const rawConfig: unknown = JSON.parse(readFileSync(absolutePath, 'utf8'));
      return new BuildCatalog(buildConfigSchema.parse(rawConfig));
    } catch (error) {
      throw new BotConfigurationError(
        `No se pudo cargar una configuración válida desde ${absolutePath}.`,
        { cause: error },
      );
    }
  }

  public get description(): string {
    return this.#config.description;
  }

  public get version(): number {
    return this.#config.version;
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
}
