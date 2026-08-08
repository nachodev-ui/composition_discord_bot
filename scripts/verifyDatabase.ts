import 'dotenv/config';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresBuildRepository } from '../src/db/postgresBuildRepository.js';
import { PostgresSignupStateStore } from '../src/db/postgresSignupStateStore.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL es obligatorio para verificar PostgreSQL.');

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

  const tables = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND table_name = ANY($1::text[])
     ORDER BY table_name`,
    [requiredTables],
  );
  if (tables.rows.length !== requiredTables.length) {
    throw new Error(`Faltan tablas: esperadas ${requiredTables.length}, encontradas ${tables.rows.length}.`);
  }
} finally {
  await pool.end();
}

const repository = new PostgresBuildRepository(databaseUrl);
try {
  const importedBuilds = await repository.listBuilds({ enabledOnly: true });
  const first = importedBuilds[0];
  const second = importedBuilds[1];
  if (!first?.id || !second?.id) throw new Error('Las builds importadas no tienen UUID persistido.');

  const composition = await repository.createComposition({
    name: 'CI Brawl Composition',
    slug: 'ci-brawl-composition',
    category: 'CI',
    status: 'ready',
    discordChannelId: '10000000000000001',
    slots: [
      { position: 1, buildId: first.id, requiredCount: 1 },
      { position: 2, buildId: second.id, label: 'Segundo puesto', requiredCount: 2 },
    ],
  });
  if (composition.slots.length !== 2) throw new Error('La composición no persistió sus dos puestos.');

  const updatedComposition = await repository.updateComposition(composition.id, {
    name: 'CI Brawl Composition v2',
    slug: 'ci-brawl-composition',
    category: 'CI',
    status: 'published',
    discordChannelId: '10000000000000001',
    slots: [{ position: 1, buildId: first.id, requiredCount: 1 }],
  });
  if (!updatedComposition || updatedComposition.version !== 2 || updatedComposition.slots.length !== 1) {
    throw new Error('La actualización de composición no incrementó versión o no reemplazó sus puestos.');
  }

  const tinyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  const sha256 = createHash('sha256').update(tinyPng).digest('hex');
  const imageBuild = await repository.saveBuildImage(
    first.id,
    { data: tinyPng, contentType: 'image/png', width: 1, height: 1, byteSize: tinyPng.length, sha256 },
    `https://example.invalid/media/builds/${first.id}.png?v=1`,
  );
  if (!imageBuild?.imageUrl || imageBuild.imageVersion !== 1) {
    throw new Error('La build no persistió la URL/versión de la imagen.');
  }
  const storedImage = await repository.getBuildImage(first.id);
  if (!storedImage || storedImage.sha256 !== sha256 || !storedImage.data.equals(tinyPng)) {
    throw new Error('Los bytes de la imagen no se recuperaron íntegramente desde PostgreSQL.');
  }

  if (!(await repository.archiveComposition(composition.id))) {
    throw new Error('No se pudo archivar la composición de prueba.');
  }
} finally {
  await repository.close();
}

const signupStore = new PostgresSignupStateStore(databaseUrl, '10000000000000999');
try {
  await signupStore.load();
  const firstClaim = await signupStore.claimSlot({
    buildNumber: 1,
    userId: '10000000000000111',
    roleId: '10000000000000222',
  });
  if (firstClaim.assignment.buildNumber !== 1) throw new Error('El signup no asignó la build #1.');

  const secondClaim = await signupStore.claimSlot({
    buildNumber: 2,
    userId: '10000000000000111',
    roleId: '10000000000000333',
  });
  if (secondClaim.previousBuildNumber !== 1 || signupStore.getAssignmentByBuild(1)) {
    throw new Error('El cambio de puesto no liberó correctamente la build anterior.');
  }

  await signupStore.setPanelMessageId('10000000000000444');
  if (signupStore.snapshot().panelMessageId !== '10000000000000444') {
    throw new Error('El ID persistente del panel no se actualizó.');
  }

  const released = await signupStore.releaseUser('10000000000000111');
  if (released?.buildNumber !== 2) throw new Error('No se liberó el puesto actual del usuario.');
} finally {
  await signupStore.close();
}

console.log(JSON.stringify({
  valid: true,
  builds: 20,
  tables: requiredTables,
  compositionCrud: true,
  imagePersistence: true,
  signupPersistence: true,
}, null, 2));
