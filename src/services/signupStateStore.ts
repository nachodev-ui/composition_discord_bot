import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createEmptySignupState,
  signupStateSchema,
  type SignupAssignment,
  type SignupState,
} from '../domain/signupState.js';
import { SignupSlotOccupiedError } from '../domain/errors.js';

export interface ClaimSlotInput {
  buildNumber: number;
  userId: string;
  roleId: string;
  assignedAt?: string;
}

export interface ClaimSlotResult {
  assignment: SignupAssignment;
  previousBuildNumber: number | null;
}

export class SignupStateStore {
  readonly #absolutePath: string;
  #state: SignupState = createEmptySignupState();
  #loaded = false;
  #mutationTail: Promise<void> = Promise.resolve();

  public constructor(statePath: string) {
    this.#absolutePath = resolve(process.cwd(), statePath);
  }

  public async load(): Promise<void> {
    try {
      const raw = await readFile(this.#absolutePath, 'utf8');
      this.#state = signupStateSchema.parse(JSON.parse(raw) as unknown);
    } catch (error) {
      if (!isMissingFileError(error)) {
        throw error;
      }
      this.#state = createEmptySignupState();
      await this.#persist();
    }
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
    const assignment = Object.values(this.#state.assignments).find(
      (candidate) => candidate.userId === userId,
    );
    return assignment ? structuredClone(assignment) : undefined;
  }

  public async setPanelMessageId(messageId: string | null): Promise<void> {
    await this.#enqueue(async () => {
      this.#state.panelMessageId = messageId;
      await this.#persist();
    });
  }

  public async claimSlot(input: ClaimSlotInput): Promise<ClaimSlotResult> {
    return this.#enqueue(async () => {
      const slotKey = String(input.buildNumber);
      const occupied = this.#state.assignments[slotKey];
      if (occupied && occupied.userId !== input.userId) {
        throw new SignupSlotOccupiedError(input.buildNumber, occupied.userId);
      }

      let previousBuildNumber: number | null = null;
      for (const [key, assignment] of Object.entries(this.#state.assignments)) {
        if (assignment.userId === input.userId && assignment.buildNumber !== input.buildNumber) {
          previousBuildNumber = assignment.buildNumber;
          delete this.#state.assignments[key];
        }
      }

      const assignment: SignupAssignment = {
        buildNumber: input.buildNumber,
        userId: input.userId,
        roleId: input.roleId,
        assignedAt: input.assignedAt ?? new Date().toISOString(),
      };
      this.#state.assignments[slotKey] = assignment;
      await this.#persist();

      return {
        assignment: structuredClone(assignment),
        previousBuildNumber,
      };
    });
  }

  public async releaseBuild(buildNumber: number): Promise<SignupAssignment | null> {
    return this.#enqueue(async () => {
      const key = String(buildNumber);
      const removed = this.#state.assignments[key];
      if (!removed) {
        return null;
      }
      delete this.#state.assignments[key];
      await this.#persist();
      return structuredClone(removed);
    });
  }

  public async releaseUser(userId: string): Promise<SignupAssignment | null> {
    return this.#enqueue(async () => {
      const entry = Object.entries(this.#state.assignments).find(
        ([, assignment]) => assignment.userId === userId,
      );
      if (!entry) {
        return null;
      }
      const [key, assignment] = entry;
      delete this.#state.assignments[key];
      await this.#persist();
      return structuredClone(assignment);
    });
  }

  async #persist(): Promise<void> {
    await mkdir(dirname(this.#absolutePath), { recursive: true });
    await writeFile(this.#absolutePath, `${JSON.stringify(this.#state, null, 2)}\n`, 'utf8');
  }

  async #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#mutationTail.then(operation, operation);
    this.#mutationTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  #assertLoaded(): void {
    if (!this.#loaded) {
      throw new Error('SignupStateStore debe cargarse antes de utilizarse.');
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
