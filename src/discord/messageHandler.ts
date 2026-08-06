import type { Message } from 'discord.js';
import type { Environment } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import { SignupSlotOccupiedError } from '../domain/errors.js';
import { parseRoleNumber } from '../domain/parseRoleNumber.js';
import type { BuildCatalog } from '../services/buildCatalog.js';
import type { Cooldown } from '../services/cooldown.js';
import type { SignupService } from '../services/signupService.js';
import { createBuildButtonRow } from './buildButton.js';
import type { SignupPanelService } from './signupPanelService.js';

interface MessageHandlerDependencies {
  environment: Environment;
  catalog: BuildCatalog;
  cooldown: Cooldown;
  signupService: SignupService;
  panelService: SignupPanelService;
  logger: Logger;
}

export class MessageHandler {
  readonly #environment: Environment;
  readonly #catalog: BuildCatalog;
  readonly #cooldown: Cooldown;
  readonly #signupService: SignupService;
  readonly #panelService: SignupPanelService;
  readonly #logger: Logger;

  public constructor(dependencies: MessageHandlerDependencies) {
    this.#environment = dependencies.environment;
    this.#catalog = dependencies.catalog;
    this.#cooldown = dependencies.cooldown;
    this.#signupService = dependencies.signupService;
    this.#panelService = dependencies.panelService;
    this.#logger = dependencies.logger;
  }

  public async handle(message: Message): Promise<void> {
    if (message.author.bot || !message.inGuild()) {
      return;
    }

    if (
      message.guildId !== this.#environment.DISCORD_GUILD_ID ||
      message.channelId !== this.#environment.ROLE_SELECTION_CHANNEL_ID
    ) {
      return;
    }

    const roleNumber = parseRoleNumber(message.content);
    if (roleNumber === null) {
      return;
    }

    const build = this.#catalog.getByNumber(roleNumber);
    if (!build) {
      await this.#sendTemporaryMessage(
        message,
        `El número **${roleNumber}** no corresponde a un puesto habilitado.`,
      );
      return;
    }

    const remainingCooldown = this.#cooldown.consume(message.author.id);
    if (remainingCooldown > 0) {
      await this.#sendTemporaryMessage(
        message,
        `Espera ${remainingCooldown} segundo(s) antes de cambiar nuevamente de puesto.`,
      );
      return;
    }

    try {
      const member = message.member ?? (await message.guild.members.fetch(message.author.id));
      const result = await this.#signupService.assign(member, build, {
        replaceExisting: this.#environment.ROLE_REPLACEMENT_ENABLED,
        createMissing: this.#environment.AUTO_CREATE_MISSING_ROLES,
      });

      await this.#panelService.refresh(message.guild);
      await this.#addSuccessReaction(message);

      const removed = result.removedRoles.map((role) => role.name).join(', ');
      const status = result.alreadyAssigned ? 'Puesto confirmado' : 'Puesto asignado';
      await message.reply({
        content: [
          `<@${message.author.id}> — **${status}: #${build.number} ${result.targetRole.name}**`,
          removed ? `Rol anterior retirado: ${removed}.` : null,
          'Pulsa el botón para consultar tu build obligatoria de forma privada.',
        ]
          .filter((line): line is string => line !== null)
          .join('\n'),
        components: [createBuildButtonRow(build.number, message.author.id)],
        allowedMentions: {
          users: [message.author.id],
          repliedUser: false,
        },
      });

      this.#logger.info(
        {
          guildId: message.guildId,
          userId: message.author.id,
          buildNumber: build.number,
          roleId: result.targetRole.id,
          previousBuildNumber: result.previousBuildNumber,
          removedRoleIds: result.removedRoles.map((role) => role.id),
        },
        'Puesto de composición asignado y panel actualizado.',
      );
    } catch (error) {
      this.#cooldown.clear(message.author.id);
      this.#logger.error(
        { err: error, userId: message.author.id, buildNumber: build.number },
        'No se pudo procesar la selección numérica.',
      );

      const reason =
        error instanceof SignupSlotOccupiedError
          ? `El puesto **#${error.buildNumber}** ya está ocupado por <@${error.occupantUserId}>.`
          : error instanceof Error
            ? error.message
            : 'Error inesperado.';
      await this.#sendTemporaryMessage(message, `No se pudo asignar el puesto: ${reason}`);
    }
  }

  async #addSuccessReaction(message: Message<true>): Promise<void> {
    try {
      await message.react('✅');
    } catch (error) {
      this.#logger.warn(
        { err: error, messageId: message.id },
        'La selección fue correcta, pero no se pudo añadir la reacción ✅.',
      );
    }
  }

  async #sendTemporaryMessage(message: Message<true>, content: string): Promise<void> {
    const response = await message.reply({
      content,
      allowedMentions: {
        users: [message.author.id],
        repliedUser: false,
      },
    });

    const timer = setTimeout(() => {
      void response.delete().catch(() => undefined);
    }, 12_000);
    timer.unref();
  }
}
