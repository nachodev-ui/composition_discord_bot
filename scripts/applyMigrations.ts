import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para aplicar migraciones.');

const migrationsDirectory = resolve(process.cwd(), 'db/migrations');
const files = (await readdir(migrationsDirectory))
  .filter((file) => /^\d+_.+\.sql$/u.test(file))
  .sort((left, right) => left.localeCompare(right));

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const client = await pool.connect();

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY,
      sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  for (const file of files) {
    const version = file.replace(/\.sql$/u, '');
    const sql = await readFile(resolve(migrationsDirectory, file), 'utf8');
    const sha256 = createHash('sha256').update(sql).digest('hex');
    const existing = await client.query<{ sha256: string }>(
      'SELECT sha256 FROM schema_migrations WHERE version=$1',
      [version],
    );

    if (existing.rows[0]) {
      if (existing.rows[0].sha256 !== sha256) {
        throw new Error(`La migración ${version} ya fue aplicada con un contenido diferente.`);
      }
      console.log(`skip ${version}`);
      continue;
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query(
        'INSERT INTO schema_migrations (version,sha256) VALUES ($1,$2)',
        [version, sha256],
      );
      await client.query('COMMIT');
      console.log(`applied ${version}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
