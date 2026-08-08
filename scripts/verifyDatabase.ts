import 'dotenv/config';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para verificar PostgreSQL.');

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
try {
  const migration = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM schema_migrations WHERE version='001_build_platform'`,
  );
  if (migration.rows[0]?.count !== '1') throw new Error('La migración 001_build_platform no está registrada.');

  const builds = await pool.query<{ count: string; ready: string }>(
    `SELECT count(*)::text AS count,
            count(*) FILTER (WHERE status='ready' AND enabled=true)::text AS ready
     FROM builds`,
  );
  if (builds.rows[0]?.count !== '20' || builds.rows[0]?.ready !== '20') {
    throw new Error(`Se esperaban 20 builds importadas y listas; recibido ${JSON.stringify(builds.rows[0])}.`);
  }

  const requiredTables = [
    'admin_audit_log',
    'bot_runtime_state',
    'build_images',
    'build_publications',
    'build_versions',
    'builds',
    'composition_slots',
    'compositions',
    'signup_assignments',
  ];
  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [requiredTables],
  );
  if (tables.rows.length !== requiredTables.length) {
    throw new Error(`Faltan tablas: esperadas ${requiredTables.length}, encontradas ${tables.rows.length}.`);
  }

  console.log(JSON.stringify({ valid: true, builds: 20, tables: tables.rows.map((row) => row.table_name) }, null, 2));
} finally {
  await pool.end();
}
