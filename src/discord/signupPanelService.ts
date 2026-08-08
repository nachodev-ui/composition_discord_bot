import { ChannelType, type Guild, type Message, type TextChannel } from 'discord.js';
import type { Environment } from '../config/env.js';
import type { Logger } from '../config/logger.js';
import type { BuildCatalog } from '../services/buildCatalog.js';
import type { SignupStateStorage } from '../services/signupStateStore.js';
import { createRolePanel } from './panelPresentation.js';

export class SignupPanelService {
  readonly #environment: Environment;
  readonly #catalog: BuildCatalog;
  readonly #stateStore: SignupStateStorage;
  readonly #logger: Logger;

  public constructor(options: {
    environment: Environment;
    catalog: BuildCatalog;
    stateStore: SignupStateStorage;
    logger: Logger;
  }) {
    this.#environment = options.environment;
    this.#catalog = options.catalog;
    this.#stateStore = options.stateStore;
    this.#logger = options.logger;
  }

  public async ensurePanel(guild: Guild): Promise<Message<true>> {
    const channel = await this.#getPanelChannel(guild);
    const state = this.#stateStore.snapshot();
    const embed = createRolePanel(this.#catalog, state, channel.id);

    if (state.panelMessageId) {
      const existing = await channel.messages.fetch(state.panelMessageId).catch(() => null);
      if (existing) {
        await existing.edit({ embeds: [embed], allowedMentions: { parse: [] } });
        return existing;
      }

      this.#logger.warn({ panelMessageId: state.panelMessageId }, 'El panel guardado ya no existe; se publicará uno nuevo.');
      await this.#stateStore.setPanelMessageId(null);
    }

    const message = await channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    await this.#stateStore.setPanelMessageId(message.id);
    return message;
  }

  public async refresh(guild: Guild): Promise<Message<true>> {
    return this.ensurePanel(guild);
  }

  async #getPanelChannel(guild: Guild): Promise<TextChannel> {
    const channel = await guild.channels.fetch(this.#environment.ROLE_SELECTION_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      throw new Error('ROLE_SELECTION_CHANNEL_ID debe apuntar a un canal de texto normal.');
    }
    return channel;
  }
}
