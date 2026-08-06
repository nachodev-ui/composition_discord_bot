import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { InteractionHandler } from './discord/interactionHandler.js';
import { MessageHandler } from './discord/messageHandler.js';
import { SignupPanelService } from './discord/signupPanelService.js';
import { startHealthServer, type HealthState } from './http/healthServer.js';
import { BuildCatalog } from './services/buildCatalog.js';
import { Cooldown } from './services/cooldown.js';
import { RoleAssignmentService } from './services/roleAssignmentService.js';
import { SignupService } from './services/signupService.js';
import { SignupStateStore } from './services/signupStateStore.js';

const environment = loadEnvironment();
const logger = createLogger(environment.LOG_LEVEL);
const catalog = BuildCatalog.load(environment.BUILD_CONFIG_PATH);
const roleAssignmentService = new RoleAssignmentService(catalog);
const stateStore = new SignupStateStore(environment.SIGNUP_STATE_PATH);
await stateStore.load();
const signupService = new SignupService(roleAssignmentService, stateStore);
const cooldown = new Cooldown(environment.SELECTION_COOLDOWN_SECONDS);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const panelService = new SignupPanelService({
  environment,
  catalog,
  stateStore,
  logger,
});
const messageHandler = new MessageHandler({
  environment,
  catalog,
  cooldown,
  signupService,
  panelService,
  logger,
});
const interactionHandler = new InteractionHandler({
  environment,
  catalog,
  roleAssignmentService,
  signupService,
  stateStore,
  panelService,
  logger,
});

const healthState: HealthState = {
  ready: false,
  discordUser: null,
  startedAt: Date.now(),
};
const healthServer = startHealthServer(environment.PORT, () => healthState, logger);

client.once(Events.ClientReady, async (readyClient) => {
  healthState.ready = true;
  healthState.discordUser = readyClient.user.tag;
  logger.info(
    {
      discordUser: readyClient.user.tag,
      enabledBuilds: catalog.all.length,
      configVersion: catalog.version,
    },
    'Bot conectado a Discord.',
  );

  try {
    const guild = await readyClient.guilds.fetch(environment.DISCORD_GUILD_ID);
    const channel = await guild.channels.fetch(environment.ROLE_SELECTION_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error('ROLE_SELECTION_CHANNEL_ID no apunta a un canal de texto válido.');
    }

    if (environment.AUTO_CREATE_MISSING_ROLES) {
      const result = await roleAssignmentService.syncRoles(guild, true);
      logger.info(
        { createdRoles: result.created.length, foundRoles: result.found.length },
        'Sincronización automática de roles completada.',
      );
    }

    if (environment.AUTO_PUBLISH_PANEL) {
      const panel = await panelService.ensurePanel(guild);
      logger.info({ panelMessageId: panel.id }, 'Panel de signup publicado o actualizado.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Falló la validación inicial del servidor de Discord.');
  }
});

client.on(Events.MessageCreate, (message) => {
  void messageHandler.handle(message);
});

client.on(Events.InteractionCreate, (interaction) => {
  void interactionHandler.handle(interaction);
});

client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== environment.DISCORD_GUILD_ID) {
    return;
  }

  void signupService
    .releaseUser(member.id)
    .then(async (released) => {
      if (released) {
        await panelService.refresh(member.guild);
        logger.info(
          { userId: member.id, buildNumber: released.buildNumber },
          'Se liberó el puesto de un miembro que abandonó el servidor.',
        );
      }
    })
    .catch((error: unknown) => {
      logger.error({ err: error, userId: member.id }, 'No se pudo liberar el puesto del miembro.');
    });
});

client.on(Events.Error, (error) => {
  logger.error({ err: error }, 'El cliente de Discord emitió un error.');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Promesa rechazada sin manejar.');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Excepción no controlada.');
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  healthState.ready = false;
  logger.info({ signal }, 'Cerrando el bot.');

  client.destroy();
  await new Promise<void>((resolve) => healthServer.close(() => resolve()));
}

process.once('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit());
});
process.once('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit());
});

await client.login(environment.DISCORD_TOKEN);
