import {
  PermissionFlagsBits,
  type Collection,
  type Guild,
  type GuildMember,
  type Role,
  type Snowflake,
} from 'discord.js';
import type { AlbionBuild } from '../domain/build.js';
import { RoleAssignmentError } from '../domain/errors.js';
import type { BuildCatalog } from './buildCatalog.js';

export interface RoleSyncResult {
  rolesByBuildNumber: ReadonlyMap<number, Role>;
  created: readonly Role[];
  found: readonly Role[];
  missing: readonly AlbionBuild[];
}

export interface RoleAssignmentResult {
  targetRole: Role;
  removedRoles: readonly Role[];
  alreadyAssigned: boolean;
}

export class RoleAssignmentService {
  readonly #catalog: BuildCatalog;

  public constructor(catalog: BuildCatalog) {
    this.#catalog = catalog;
  }

  public async syncRoles(guild: Guild, createMissing: boolean): Promise<RoleSyncResult> {
    const botMember = await this.#requireBotRoleManagement(guild);
    const guildRoles = await guild.roles.fetch();
    const rolesByBuildNumber = new Map<number, Role>();
    const created: Role[] = [];
    const found: Role[] = [];
    const missing: AlbionBuild[] = [];

    for (const build of this.#catalog.all) {
      let role = this.#findRole(guildRoles, build);

      if (!role && createMissing) {
        role = await guild.roles.create({
          name: build.discordRole.name,
          mentionable: false,
          reason: `Rol creado para la build #${build.number}.`,
        });
        created.push(role);
      } else if (role) {
        found.push(role);
      }

      if (!role) {
        missing.push(build);
        continue;
      }

      this.#assertRoleManageable(botMember, role);
      rolesByBuildNumber.set(build.number, role);
    }

    return { rolesByBuildNumber, created, found, missing };
  }

  public async resolveBuildRole(
    guild: Guild,
    build: AlbionBuild,
    createMissing: boolean,
  ): Promise<Role> {
    const botMember = await this.#requireBotRoleManagement(guild);
    const guildRoles = await guild.roles.fetch();
    let role = this.#findRole(guildRoles, build);

    if (!role && createMissing) {
      role = await guild.roles.create({
        name: build.discordRole.name,
        mentionable: false,
        reason: `Rol creado para la build #${build.number}.`,
      });
    }

    if (!role) {
      throw new RoleAssignmentError(
        `No existe el rol ${build.discordRole.name}. Un administrador debe ejecutar /sincronizar-roles.`,
      );
    }

    this.#assertRoleManageable(botMember, role);
    return role;
  }

  public async assignBuildRole(
    member: GuildMember,
    build: AlbionBuild,
    options: { replaceExisting: boolean; createMissing: boolean },
  ): Promise<RoleAssignmentResult> {
    if (!member.manageable) {
      throw new RoleAssignmentError(
        'El bot no puede administrar a este miembro. Revisa la jerarquía o prueba con una cuenta que no sea propietaria del servidor.',
      );
    }

    const targetRole = await this.resolveBuildRole(
      member.guild,
      build,
      options.createMissing,
    );
    const guildRoles = await member.guild.roles.fetch();
    const configuredRoles = this.#catalog.all
      .map((candidate) => this.#findRole(guildRoles, candidate))
      .filter((role): role is Role => role !== undefined);

    const rolesToRemove = options.replaceExisting
      ? configuredRoles.filter(
          (role) => role.id !== targetRole.id && member.roles.cache.has(role.id),
        )
      : [];

    for (const role of rolesToRemove) {
      if (!role.editable) {
        throw new RoleAssignmentError(
          `No puedo retirar el rol ${role.name}; revisa la jerarquía del rol del bot.`,
        );
      }
    }

    const alreadyAssigned = member.roles.cache.has(targetRole.id);
    if (!alreadyAssigned) {
      await member.roles.add(
        targetRole,
        `Selección de build #${build.number}: ${build.discordRole.name}`,
      );
    }

    if (rolesToRemove.length > 0) {
      await member.roles.remove(
        rolesToRemove,
        `Reemplazo automático por build #${build.number}: ${build.discordRole.name}`,
      );
    }

    return { targetRole, removedRoles: rolesToRemove, alreadyAssigned };
  }

  async #requireBotRoleManagement(guild: Guild): Promise<GuildMember> {
    const botMember = guild.members.me ?? (await guild.members.fetchMe());
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new RoleAssignmentError('El bot no tiene el permiso Administrar roles.');
    }
    return botMember;
  }

  #findRole(
    roles: Collection<Snowflake, Role>,
    build: AlbionBuild,
  ): Role | undefined {
    if (build.discordRole.id) {
      const roleById = roles.get(build.discordRole.id);
      if (roleById) {
        return roleById;
      }
    }

    const expectedName = build.discordRole.name.toLocaleLowerCase('es');
    return roles.find(
      (candidate) => candidate.name.toLocaleLowerCase('es') === expectedName,
    );
  }

  #assertRoleManageable(botMember: GuildMember, role: Role): void {
    if (role.managed) {
      throw new RoleAssignmentError(
        `El rol ${role.name} está administrado por una integración y no puede asignarse manualmente.`,
      );
    }
    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      throw new RoleAssignmentError(
        `El rol del bot debe estar por encima de ${role.name} en la jerarquía del servidor.`,
      );
    }
  }
}
