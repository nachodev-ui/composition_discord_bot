import { Pool, type PoolClient } from 'pg';
import { buildSchema, buildWriteSchema, type AlbionBuild, type BuildWriteInput } from '../domain/build.js';

interface BuildRow {
  id: string;
  number: number;
  name: string;
  category: string;
  status: AlbionBuild['status'];
  enabled: boolean;
  discord_role_id: string | null;
  discord_role_name: string;
  equipment: AlbionBuild['equipment'];
  consumables: AlbionBuild['consumables'];
  item_ids: AlbionBuild['itemIds'];
  alternatives: string | null;
  source_url: string | null;
  image_url: string | null;
  image_version: number;
  version: number;
}

export interface BuildImageRecord {
  data: Buffer;
  contentType: string;
  width: number;
  height: number;
  byteSize: number;
  sha256: string;
}

export interface CompositionRecord {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  status: 'draft' | 'ready' | 'published' | 'archived';
  discordChannelId: string | null;
  version: number;
  slots: Array<{
    position: number;
    buildId: string;
    buildNumber: number;
    buildName: string;
    label: string | null;
    requiredCount: number;
  }>;
}

export interface CompositionWriteInput {
  name: string;
  slug: string;
  category?: string;
  description?: string | null;
  status?: CompositionRecord['status'];
  discordChannelId?: string | null;
  slots?: Array<{ position: number; buildId: string; label?: string | null; requiredCount?: number }>;
}

function mapBuild(row: BuildRow): AlbionBuild {
  return buildSchema.parse({
    id: row.id,
    number: row.number,
    name: row.name,
    category: row.category,
    status: row.status,
    enabled: row.enabled,
    version: row.version,
    discordRole: { id: row.discord_role_id ?? '', name: row.discord_role_name },
    equipment: row.equipment,
    consumables: row.consumables,
    itemIds: row.item_ids ?? {},
    alternatives: row.alternatives,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    imageVersion: row.image_version,
  });
}

const BUILD_COLUMNS = `
  id, number, name, category, status, enabled,
  discord_role_id, discord_role_name, equipment, consumables, item_ids,
  alternatives, source_url, image_url, image_version, version
`;

export class PostgresBuildRepository {
  readonly #pool: Pool;

  public constructor(databaseUrl: string) {
    this.#pool = new Pool({ connectionString: databaseUrl, max: 8 });
  }

  public async close(): Promise<void> {
    await this.#pool.end();
  }

  public async ping(): Promise<void> {
    await this.#pool.query('SELECT 1');
  }

  public async listBuilds(options: { includeArchived?: boolean; enabledOnly?: boolean } = {}): Promise<AlbionBuild[]> {
    const predicates: string[] = [];
    if (!options.includeArchived) predicates.push(`status <> 'archived'`);
    if (options.enabledOnly) predicates.push('enabled = true');
    const where = predicates.length > 0 ? `WHERE ${predicates.join(' AND ')}` : '';
    const result = await this.#pool.query<BuildRow>(`SELECT ${BUILD_COLUMNS} FROM builds ${where} ORDER BY number`);
    return result.rows.map(mapBuild);
  }

  public async getBuildByNumber(number: number): Promise<AlbionBuild | null> {
    const result = await this.#pool.query<BuildRow>(`SELECT ${BUILD_COLUMNS} FROM builds WHERE number = $1 LIMIT 1`, [number]);
    return result.rows[0] ? mapBuild(result.rows[0]) : null;
  }

  public async getBuildById(id: string): Promise<AlbionBuild | null> {
    const result = await this.#pool.query<BuildRow>(`SELECT ${BUILD_COLUMNS} FROM builds WHERE id = $1 LIMIT 1`, [id]);
    return result.rows[0] ? mapBuild(result.rows[0]) : null;
  }

  public async createBuild(rawInput: BuildWriteInput): Promise<AlbionBuild> {
    const input = buildWriteSchema.parse(rawInput);
    const result = await this.#pool.query<BuildRow>(
      `INSERT INTO builds (
        number, name, category, status, enabled, discord_role_id, discord_role_name,
        equipment, consumables, item_ids, alternatives, source_url, image_url
      ) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13)
      RETURNING ${BUILD_COLUMNS}`,
      [input.number, input.name, input.category, input.status, input.enabled, input.discordRole.id,
       input.discordRole.name, JSON.stringify(input.equipment), JSON.stringify(input.consumables),
       JSON.stringify(input.itemIds), input.alternatives ?? null, input.sourceUrl ?? null, input.imageUrl ?? null],
    );
    const build = mapBuild(result.rows[0]!);
    await this.#writeVersion(build);
    await this.#audit('create', 'build', build.id ?? null, build);
    return build;
  }

  public async updateBuild(id: string, rawInput: BuildWriteInput): Promise<AlbionBuild | null> {
    const input = buildWriteSchema.parse(rawInput);
    const result = await this.#pool.query<BuildRow>(
      `UPDATE builds SET
        number=$2, name=$3, category=$4, status=$5, enabled=$6,
        discord_role_id=NULLIF($7,''), discord_role_name=$8, equipment=$9::jsonb,
        consumables=$10::jsonb, item_ids=$11::jsonb, alternatives=$12,
        source_url=$13, image_url=COALESCE($14, image_url), version=version+1
      WHERE id=$1 RETURNING ${BUILD_COLUMNS}`,
      [id, input.number, input.name, input.category, input.status, input.enabled, input.discordRole.id,
       input.discordRole.name, JSON.stringify(input.equipment), JSON.stringify(input.consumables),
       JSON.stringify(input.itemIds), input.alternatives ?? null, input.sourceUrl ?? null, input.imageUrl ?? null],
    );
    if (!result.rows[0]) return null;
    const build = mapBuild(result.rows[0]);
    await this.#writeVersion(build);
    await this.#audit('update', 'build', id, build);
    return build;
  }

  public async archiveBuild(id: string): Promise<boolean> {
    const result = await this.#pool.query(`UPDATE builds SET status='archived', enabled=false, version=version+1 WHERE id=$1`, [id]);
    if ((result.rowCount ?? 0) > 0) await this.#audit('archive', 'build', id, {});
    return (result.rowCount ?? 0) > 0;
  }

  public async saveBuildImage(buildId: string, image: BuildImageRecord, publicUrl: string): Promise<AlbionBuild | null> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO build_images (build_id, content_type, data, width, height, byte_size, sha256, generated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now())
         ON CONFLICT (build_id) DO UPDATE SET content_type=EXCLUDED.content_type, data=EXCLUDED.data,
           width=EXCLUDED.width, height=EXCLUDED.height, byte_size=EXCLUDED.byte_size,
           sha256=EXCLUDED.sha256, generated_at=now()`,
        [buildId, image.contentType, image.data, image.width, image.height, image.byteSize, image.sha256],
      );
      const result = await client.query<BuildRow>(
        `UPDATE builds SET image_url=$2, image_version=image_version+1, version=version+1
         WHERE id=$1 RETURNING ${BUILD_COLUMNS}`,
        [buildId, publicUrl],
      );
      await client.query('COMMIT');
      const build = result.rows[0] ? mapBuild(result.rows[0]) : null;
      if (build) await this.#writeVersion(build);
      return build;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async getBuildImage(buildId: string): Promise<BuildImageRecord | null> {
    const result = await this.#pool.query<{
      data: Buffer; content_type: string; width: number; height: number; byte_size: number; sha256: string;
    }>('SELECT data, content_type, width, height, byte_size, sha256 FROM build_images WHERE build_id=$1', [buildId]);
    const row = result.rows[0];
    return row ? { data: row.data, contentType: row.content_type, width: row.width, height: row.height, byteSize: row.byte_size, sha256: row.sha256 } : null;
  }

  public async listCompositions(): Promise<CompositionRecord[]> {
    const compositions = await this.#pool.query<{
      id: string; name: string; slug: string; category: string; description: string | null;
      status: CompositionRecord['status']; discord_channel_id: string | null; version: number;
    }>(`SELECT id,name,slug,category,description,status,discord_channel_id,version FROM compositions WHERE status <> 'archived' ORDER BY name`);
    const output: CompositionRecord[] = [];
    for (const row of compositions.rows) {
      const slots = await this.#pool.query<{
        position: number; build_id: string; build_number: number; build_name: string; label: string | null; required_count: number;
      }>(`SELECT cs.position,cs.build_id,b.number AS build_number,b.name AS build_name,cs.label,cs.required_count
          FROM composition_slots cs JOIN builds b ON b.id=cs.build_id WHERE cs.composition_id=$1 ORDER BY cs.position`, [row.id]);
      output.push({
        id: row.id, name: row.name, slug: row.slug, category: row.category, description: row.description,
        status: row.status, discordChannelId: row.discord_channel_id, version: row.version,
        slots: slots.rows.map((slot) => ({ position: slot.position, buildId: slot.build_id, buildNumber: slot.build_number, buildName: slot.build_name, label: slot.label, requiredCount: slot.required_count })),
      });
    }
    return output;
  }

  public async createComposition(input: CompositionWriteInput): Promise<CompositionRecord> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const created = await client.query<{ id: string }>(
        `INSERT INTO compositions (name,slug,category,description,status,discord_channel_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [input.name, input.slug, input.category ?? 'General', input.description ?? null, input.status ?? 'draft', input.discordChannelId ?? null],
      );
      const id = created.rows[0]!.id;
      await this.#replaceCompositionSlots(client, id, input.slots ?? []);
      await client.query('COMMIT');
      await this.#audit('create', 'composition', id, input);
      return (await this.listCompositions()).find((composition) => composition.id === id)!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async updateComposition(id: string, input: CompositionWriteInput): Promise<CompositionRecord | null> {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `UPDATE compositions SET name=$2,slug=$3,category=$4,description=$5,status=$6,
         discord_channel_id=$7,version=version+1 WHERE id=$1`,
        [id, input.name, input.slug, input.category ?? 'General', input.description ?? null, input.status ?? 'draft', input.discordChannelId ?? null],
      );
      if ((updated.rowCount ?? 0) === 0) {
        await client.query('ROLLBACK');
        return null;
      }
      await this.#replaceCompositionSlots(client, id, input.slots ?? []);
      await client.query('COMMIT');
      await this.#audit('update', 'composition', id, input);
      return (await this.listCompositions()).find((composition) => composition.id === id) ?? null;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  public async archiveComposition(id: string): Promise<boolean> {
    const result = await this.#pool.query(`UPDATE compositions SET status='archived',version=version+1 WHERE id=$1`, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  public async recordPublication(input: { buildId?: string; compositionId?: string; guildId: string; channelId: string; messageId: string; type: 'build' | 'composition' }): Promise<void> {
    await this.#pool.query(
      `INSERT INTO build_publications (build_id,composition_id,guild_id,channel_id,message_id,publication_type)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [input.buildId ?? null, input.compositionId ?? null, input.guildId, input.channelId, input.messageId, input.type],
    );
  }

  async #replaceCompositionSlots(client: PoolClient, compositionId: string, slots: NonNullable<CompositionWriteInput['slots']>): Promise<void> {
    await client.query('DELETE FROM composition_slots WHERE composition_id=$1', [compositionId]);
    for (const slot of slots) {
      await client.query(
        `INSERT INTO composition_slots (composition_id,position,build_id,label,required_count) VALUES ($1,$2,$3,$4,$5)`,
        [compositionId, slot.position, slot.buildId, slot.label ?? null, slot.requiredCount ?? 1],
      );
    }
  }

  async #writeVersion(build: AlbionBuild): Promise<void> {
    if (!build.id) return;
    await this.#pool.query(
      `INSERT INTO build_versions (build_id,version,snapshot) VALUES ($1,$2,$3::jsonb)
       ON CONFLICT (build_id,version) DO NOTHING`,
      [build.id, build.version, JSON.stringify(build)],
    );
  }

  async #audit(action: string, entityType: string, entityId: string | null, payload: unknown): Promise<void> {
    await this.#pool.query(
      `INSERT INTO admin_audit_log (action,entity_type,entity_id,payload) VALUES ($1,$2,$3,$4::jsonb)`,
      [action, entityType, entityId, JSON.stringify(payload ?? {})],
    );
  }
}
