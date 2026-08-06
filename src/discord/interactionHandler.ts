import {
  MessageFlags,
  PermissionFlagsBits,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Interaction,
} from 'discord.js';
import type { Environment } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { BuildCatalog } from '../services/buildCatalog.js';
import type { RoleAssignmentService } from '../services/roleAssignmentService.js';
import type { SignupService } from '../services/signupService.js';
import type { SignupStateStore } from '../services/signupStateStore.js';
import { createBuildButtonRow, parseBuildButtonCustomId } from './buildButton.js';
import { createBuildPresentation } from './buildPresentation.js';
import type { SignupPanelService } from './signupPanelService.js';

interface InteractionHandlerDependencies {
  environment: Environment;
  catalog: BuildCatalog;
  roleAssignmentService: RoleAssignmentService;
  signupService: SignupService;
  stateStore: SignupStateStore;
  panelService: SignupPanelService;
  logger: Logger;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
}

export class InteractionHandler {
  readonly #environment: Environment;
  readonly #catalog: BuildCatalog;
  readonly #roleAssignmentService: RoleAssignmentService;
  readonly #signupService: SignupService;
  readonly #stateStore: SignupStateStore;
  readonly #panelService: SignupPanelService;
  readonly #logger: Logger;

  public constructor(dependencies: InteractionHandlerDependencies) {
    this.#environment = dependencies.environment;
    this.#catalog = dependencies.catalog;
    this.#roleAssignmentService = dependencies.roleAssignmentService;
    this.#signupService = dependencies.signupService;
    this.#stateStore = dependencies.stateStore;
    this.#panelService = dependencies.panelService;
    this.#logger = dependencies.logger;
  }

  public async handle(interaction: Interaction): Promise<void> {
    if (interaction.isButton()) {
      await this.#handleButtonSafely(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.guildId !== this.#environment.DISCORD_GUILD_ID || !interaction.guild) {
      await interaction.reply({
        content: 'Este comando solo está disponible en el servidor configurado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      switch (interaction.commandName) {
        case 'panel':
          await this.#handlePanel(interaction);
          break;
        case 'build':
          await this.#handleBuild(interaction);
          break;
        case 'rol':
          await this.#handleRole(interaction);
          break;
        case 'sincronizar-roles':
          await this.#handleRoleSync(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Comando no reconocido.',
            flags: MessageFlags.Ephemeral,
          });
      }
    } catch (error) {
      this.#logger.error(
        { err: error, command: interaction.commandName, userId: interaction.user.id },
        'Falló un comando de Discord.',
      );
      await this.#replyWithError(interaction, errorMessage(error));
    }
  }

  async #handleButtonSafely(interaction: ButtonInteraction): Promise<void> {
    const buttonData = parseBuildButtonCustomId(interaction.customId);
    if (!buttonData) {
      return;
    }

    if (interaction.guildId !== this.#environment.DISCORD_GUILD_ID) {
      await interaction.reply({
        content: 'Este botón no pertenece al servidor configurado.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      if (interaction.user.id !== buttonData.assigneeUserId) {
        await interaction.reply({
          content: 'Este botón pertenece al jugador que seleccionó ese puesto.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const activeAssignment = this.#stateStore.getAssignmentByUser(interaction.user.id);
      if (!activeAssignment || activeAssignment.buildNumber !== buttonData.buildNumber) {
        await interaction.reply({
          content: 'Este botón quedó desactualizado porque tu puesto actual cambió.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const build = this.#catalog.getByNumber(buttonData.buildNumber);
      if (!build) {
        await interaction.reply({
          content: 'La build asociada ya no está habilitada.',
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const presentation = createBuildPresentation(build);
      await interaction.editReply({
        content: `Build obligatoria para **#${build.number} ${build.discordRole.name}**.`,
        ...presentation,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      this.#logger.error(
        { err: error, customId: interaction.customId, userId: interaction.user.id },
        'Falló el botón Ver Build.',
      );
      await this.#replyWithError(interaction, errorMessage(error));
    }
  }

  async #handlePanel(interaction: ChatInputCommandInteraction): Promise<void> {
    this.#requireManageRoles(interaction);
    const panel = await this.#panelService.ensurePanel(interaction.guild!);
    await interaction.reply({
      content: `Panel publicado o actualizado: ${panel.url}`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }

  async #handleBuild(interaction: ChatInputCommandInteraction): Promise<void> {
    const number = interaction.options.getInteger('numero', true);
    const build = this.#catalog.getByNumber(number);
    if (!build) {
      await interaction.reply({
        content: `No existe una build habilitada con el número ${number}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.editReply({
      ...createBuildPresentation(build),
      allowedMentions: { parse: [] },
    });
  }

  async #handleRole(interaction: ChatInputCommandInteraction): Promise<void> {
    const number = interaction.options.getInteger('numero', true);
    const build = this.#catalog.getByNumber(number);
    if (!build) {
      await interaction.reply({
        content: `No existe un puesto habilitado con el número ${number}.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const member = await interaction.guild!.members.fetch(interaction.user.id);
    const result = await this.#signupService.assign(member, build, {
      replaceExisting: this.#environment.ROLE_REPLACEMENT_ENABLED,
      createMissing: this.#environment.AUTO_CREATE_MISSING_ROLES,
    });
    await this.#panelService.refresh(interaction.guild!);

    await interaction.editReply({
      content: `Puesto asignado: **#${build.number} ${result.targetRole.name}**. Pulsa el botón para ver tu build.`,
      components: [createBuildButtonRow(build.number, interaction.user.id)],
      allowedMentions: { parse: [] },
    });
  }

  async #handleRoleSync(interaction: ChatInputCommandInteraction): Promise<void> {
    this.#requireManageRoles(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.#roleAssignmentService.syncRoles(interaction.guild!, true);
    await interaction.editReply({
      content: [
        `Roles creados: **${result.created.length}**.`,
        `Roles encontrados: **${result.found.length}**.`,
        result.missing.length > 0
          ? `Roles aún faltantes: ${result.missing.map((build) => build.discordRole.name).join(', ')}`
          : 'No quedan roles faltantes.',
      ].join('\n'),
      allowedMentions: { parse: [] },
    });
  }

  async #replyWithError(
    interaction: ButtonInteraction | ChatInputCommandInteraction,
    reason: string,
  ): Promise<void> {
    const content = `No se pudo completar la operación: ${reason}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content, components: [], embeds: [], attachments: [] });
      return;
    }
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }

  #requireManageRoles(interaction: ChatInputCommandInteraction): void {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('Necesitas el permiso Administrar roles para usar este comando.');
    }
  }
}
