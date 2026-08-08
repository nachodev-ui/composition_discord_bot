import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildConfigSchema } from '../src/domain/build.js';
import { PostgresBuildRepository } from '../src/db/postgresBuildRepository.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para importar las builds.');

const sourcePath = process.env.LEGACY_BUILD_CONFIG_PATH?.trim() || 'config/builds.json';
const parsed = buildConfigSchema.parse(JSON.parse(await readFile(resolve(process.cwd(), sourcePath), 'utf8')));
const repository = new PostgresBuildRepository(databaseUrl);

let imported = 0;
let skipped = 0;
try {
  await repository.ping();
  for (const build of parsed.builds) {
    if (await repository.getBuildByNumber(build.number)) {
      skipped += 1;
      continue;
    }
    await repository.createBuild({
      number: build.number,
      name: build.name,
      category: build.category,
      status: 'ready',
      enabled: build.enabled,
      discordRole: build.discordRole,
      equipment: build.equipment,
      consumables: build.consumables,
      itemIds: build.itemIds ?? {},
      alternatives: build.alternatives ?? null,
      sourceUrl: build.sourceUrl ?? null,
      imageUrl: build.imageUrl ?? null,
    });
    imported += 1;
  }
  console.log(`Importación completada: ${imported} nuevas, ${skipped} existentes.`);
} finally {
  await repository.close();
}
