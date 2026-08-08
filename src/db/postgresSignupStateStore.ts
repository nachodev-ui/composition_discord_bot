import { Pool } from 'pg';
import { SignupSlotOccupiedError } from '../domain/errors.js';
import { createEmptySignupState, type SignupAssignment, type SignupState } from '../domain/signupState.js';
import type { ClaimSlotInput, ClaimSlotResult, SignupStateStorage } from '../services/signupStateStore.js';

interface AssignmentRow {
  build_number: number;
  user_id: string;
  role_id: string;
  assigned_at: Date | string;
}

export class PostgresSignupStateStore implements SignupStateStorage {
  readonly #pool: Pool;
  readonly #guildId: string;
  #state: SignupState = createEmptySignupState();
  #loaded = false;
  #mutationTail: Promise<void> = Promise.resolve();

  public constructor(databaseUrl: string, guildId: string) {
    this.#pool = new Pool({ connectionString: databaseUrl, max: 4 });
    this.#guildId = guildId;
  }

  public async close(): Promise<void> {
    await this.#pool.end();
  }

  public async load(): Promise<void> {
    const [stateResult, assignmentsResult] = await Promise.all([
      this.#pool.query<{ panel_message_id: string | null }>(
        'SELECT panel_message_id FROM bot_runtime_state WHERE guild_id=$1',
        [this.#guildId],
      ),
      this.#pool.query<AssignmentRow>(
        `SELECT b.number AS build_number, sa.user_id, sa.role_id, sa.assigned_at
         FROM signup_assignments sa
         JOIN builds b ON b.id = sa.build_id
         WHERE sa.guild_id=$1
         ORDER BY b.number`,
        [this.#guildId],
      ),
    ]);

    const next = createEmptySignupState();
    next.panelMessageId = stateResult.rows[0]?.panel_message_id ?? null;
    for (const row of assignmentsResult.rows) {
      next.assignments[String(row.build_number)] = this.#mapAssignment(row);
    }
    this.#state = next;
    this.#loaded = true;
  }

  public snapshot(): SignupState {
    this.#assertLoaded();
    return structuredClone(this.#state);
  }

  public getAssignmentByBuild(buildNumber: number): SignupAssignment | undefined {
    this.#assertLoaded();
    const assignment = this.#state.assignments[String(buildNumber)];
    return assignment ? structuredClone(assignment) : undefined;
  }

  public getAssignmentByUser(userId: string): SignupAssignment | undefined {
    this.#assertLoaded();
    const assignment = Object.values(this.#state.assignments).find((candidate) => candidate.userId === userId);
    return assignment ? structuredClone(assignment) : undefined;
  }

  public async setPanelMessageId(messageId: string | null): Promise<void> {
    await this.#enqueue(async () => {
      await this.#pool.query(
        `INSERT INTO bot_runtime_state (guild_id,panel_message_id) VALUES ($1,$2)
         ON CONFLICT (guild_id) DO UPDATE SET panel_message_id=EXCLUDED.panel_message_id,updated_at=now()`,
        [this.#guildId, messageId],
      );
      this.#state.panelMessageId = messageId;
    });
  }

  public async claimSlot(input: ClaimSlotInput): Promise<ClaimSlotResult> {
    return this.#enqueue(async () => {
      const client = await this.#pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${this.#guildId}:${input.buildNumber}`]);

        const buildResult = await client.query<{ id: string }>('SELECT id FROM builds WHERE number=$1 AND enabled=true LIMIT 1', [input.buildNumber]);
        const buildId = buildResult.rows[0]?.id;
        if (!buildId) throw new Error(`La build #${input.buildNumber} no existe o está deshabilitada.`);

        const occupiedResult = await client.query<{ user_id: string }>(
          'SELECT user_id FROM signup_assignments WHERE guild_id=$1 AND build_id=$2 FOR UPDATE',
          [this.#guildId, buildId],
        );
        const occupiedUserId = occupiedResult.rows[0]?.user_id;
        if (occupiedUserId && occupiedUserId !== input.userId) {
          throw new SignupSlotOccupiedError(input.buildNumber, occupiedUserId);
        }

        const previousResult = await client.query<{ build_number: number }>(
          `SELECT b.number AS build_number
           FROM signup_assignments sa JOIN builds b ON b.id=sa.build_id
           WHERE sa.guild_id=$1 AND sa.user_id=$2 LIMIT 1`,
          [this.#guildId, input.userId],
        );
        const previousBuildNumber = previousResult.rows[0]?.build_number ?? null;

        if (previousBuildNumber !== null && previousBuildNumber !== input.buildNumber) {
          await client.query('DELETE FROM signup_assignments WHERE guild_id=$1 AND user_id=$2', [this.#guildId, input.userId]);
        }

        const assignedAt = input.assignedAt ?? new Date().toISOString();
        await client.query(
          `INSERT INTO signup_assignments (guild_id,user_id,build_id,role_id,assigned_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (guild_id,user_id) DO UPDATE SET
             build_id=EXCLUDED.build_id,role_id=EXCLUDED.role_id,assigned_at=EXCLUDED.assigned_at`,
          [this.#guildId, input.userId, buildId, input.roleId, assignedAt],
        );
        await client.query('COMMIT');

        if (previousBuildNumber !== null && previousBuildNumber !== input.buildNumber) {
          delete this.#state.assignments[String(previousBuildNumber)];
        }
        const assignment: SignupAssignment = {
          buildNumber: input.buildNumber,
          userId: input.userId,
          roleId: input.roleId,
          assignedAt,
        };
        this.#state.assignments[String(input.buildNumber)] = assignment;
        return { assignment: structuredClone(assignment), previousBuildNumber: previousBuildNumber === input.buildNumber ? null : previousBuildNumber };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }

  public async releaseBuild(buildNumber: number): Promise<SignupAssignment | null> {
    return this.#enqueue(async () => {
      const existing = this.#state.assignments[String(buildNumber)];
      if (!existing) return null;
      await this.#pool.query(
        `DELETE FROM signup_assignments sa USING builds b
         WHERE sa.build_id=b.id AND sa.guild_id=$1 AND b.number=$2`,
        [this.#guildId, buildNumber],
      );
      delete this.#state.assignments[String(buildNumber)];
      return structuredClone(existing);
    });
  }

  public async releaseUser(userId: string): Promise<SignupAssignment | null> {
    return this.#enqueue(async () => {
      const existing = this.getAssignmentByUser(userId);
      if (!existing) return null;
      await this.#pool.query('DELETE FROM signup_assignments WHERE guild_id=$1 AND user_id=$2', [this.#guildId, userId]);
      delete this.#state.assignments[String(existing.buildNumber)];
      return existing;
    });
  }

  async #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#mutationTail.then(operation, operation);
    this.#mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  #mapAssignment(row: AssignmentRow): SignupAssignment {
    const assignedAt = row.assigned_at instanceof Date ? row.assigned_at.toISOString() : new Date(row.assigned_at).toISOString();
    return { buildNumber: row.build_number, userId: row.user_id, roleId: row.role_id, assignedAt };
  }

  #assertLoaded(): void {
    if (!this.#loaded) throw new Error('PostgresSignupStateStore debe cargarse antes de utilizarse.');
  }
}
