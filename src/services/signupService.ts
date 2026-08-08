import type { GuildMember } from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';
import { SignupSlotOccupiedError } from '../domain/errors.js';
import type { SignupAssignment } from '../domain/signupState.js';
import type { RoleAssignmentResult, RoleAssignmentService } from './roleAssignmentService.js';
import type { SignupStateStorage } from './signupStateStore.js';

export interface SignupResult extends RoleAssignmentResult {
  assignment: SignupAssignment;
  previousBuildNumber: number | null;
}

export class SignupService {
  readonly #roleAssignmentService: RoleAssignmentService;
  readonly #stateStore: SignupStateStorage;
  #operationTail: Promise<void> = Promise.resolve();

  public constructor(roleAssignmentService: RoleAssignmentService, stateStore: SignupStateStorage) {
    this.#roleAssignmentService = roleAssignmentService;
    this.#stateStore = stateStore;
  }

  public async assign(
    member: GuildMember,
    build: AlbionBuild,
    options: { replaceExisting: boolean; createMissing: boolean },
  ): Promise<SignupResult> {
    return this.#enqueue(async () => {
      await this.#discardStaleOccupant(member, build);

      const occupied = this.#stateStore.getAssignmentByBuild(build.number);
      if (occupied && occupied.userId !== member.id) {
        throw new SignupSlotOccupiedError(build.number, occupied.userId);
      }

      const roleResult = await this.#roleAssignmentService.assignBuildRole(member, build, options);
      const claimResult = await this.#stateStore.claimSlot({
        buildNumber: build.number,
        userId: member.id,
        roleId: roleResult.targetRole.id,
      });

      return { ...roleResult, assignment: claimResult.assignment, previousBuildNumber: claimResult.previousBuildNumber };
    });
  }

  public async releaseUser(userId: string): Promise<SignupAssignment | null> {
    return this.#stateStore.releaseUser(userId);
  }

  async #discardStaleOccupant(member: GuildMember, build: AlbionBuild): Promise<void> {
    const occupied = this.#stateStore.getAssignmentByBuild(build.number);
    if (!occupied || occupied.userId === member.id) return;
    const occupantMember = await member.guild.members.fetch(occupied.userId).catch(() => null);
    if (occupantMember?.roles.cache.has(occupied.roleId)) return;
    await this.#stateStore.releaseBuild(build.number);
  }

  async #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#operationTail.then(operation, operation);
    this.#operationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}
