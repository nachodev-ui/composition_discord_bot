import 'dotenv/config';
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { loadEnvironment } from './config/env.js';
import { createLogger } from './config/logger.js';
import { PostgresBuildRepository } from './db/postgresBuildRepository.js';
import { createBuildPresentation } from './discord/buildPresentation.js';
import { InteractionHandler } from './discord/interactionHandler.js';
import { MessageHandler } from './discord/messageHandler.js';
import { SignupPanelService } from './discord/signupPanelService.js';
import { startAppServer, type HealthState } from './http/appServer.js';
import { BuildApiClient } from './services/buildApiClient.js';
import { BuildCatalog } from './services/buildCatalog.js';
import { BuildImageGenerator } from './services/buildImageGenerator.js';
import { Cooldown } from './services/cooldown.js';
import { RoleAssignmentService } from './services/roleAssignmentService.js';
import { SignupService } from './services/signupService.js';
import { SignupStateStore } from './services/signupStateStore.js';

const environment = loadEnvironment();
const logger = createLogger(environment.LOG_LEVEL);
const repository = new PostgresBuildRepository(environment.DATABASE_URL);
await repository.ping();

const healthState: HealthState = {
  ready: false,
  discordUser: null,
  startedAt: Date.now(),
};

const imageGenerator = new BuildImageGenerator(environment.ALBION_RENDER_BASE_URL);
const appServer = await startAppServer({
  port: environment.PORT,
  adminToken: environment.ADMIN_TOKEN,
  publicBaseUrl: environment.PUBLIC_BASE_URL,
  repository,
  imageGenerator,
  getHealthState: () => healthState,
  logger,
});

const buildApi = new BuildApiClient(environment.INTERNAL_API_URL);
const catalog = await BuildCatalog.fromApi(buildApi);
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

const panelService = new SignupPanelService({ environment, catalog, stateStore, logger });
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

appServer.setBuildPublisher(async (build, requestedChannelId) => {
  if (!client.isReady()) throw new Error('El cliente de Discord todavía no está listo.');
  const guild = await client.guilds.fetch(environment.DISCORD_GUILD_ID);
  const channelId = requestedChannelId ?? environment.ROLE_SELECTION_CHANNEL_ID;
  const channel = await guild.channels.fetch(channelId);
  if (!channel || !channel.isTextBased() || !('send' in channel)) {
    throw new Error('El canal seleccionado no permite publicar mensajes.');
  }
  const presentation = createBuildPresentation(build);
  const message = await channel.send({ embeds: presentation.embeds });
  return { guildId: guild.id, channelId: channel.id, messageId: message.id };
});

appServer.setBuildChangeHandler(async () => {
  await catalog.refresh();
  if (!client.isReady()) return;
  const guild = await client.guilds.fetch(environment.DISCORD_GUILD_ID);
  await panelService.refresh(guild);
});

const syncTimer = setInterval(() => {
  void catalog.refresh().catch((error: unknown) => {
    logger.warn({ err: error }, 'No se pudo refrescar el catálogo desde la API interna.');
  });
}, environment.BUILD_SYNC_SECONDS * 1_000);
syncTimer.unref();

client.once(Events.ClientReady, async (readyClient) => {
  healthState.ready = true;
  healthState.discordUser = readyClient.user.tag;
  logger.info(
    { discordUser: readyClient.user.tag, enabledBuilds: catalog.all.length, configVersion: catalog.version },
    'Bot conectado a Discord y sincronizado con la API de builds.',
  );

  try {
    const guild = await readyClient.guilds.fetch(environment.DISCORD_GUILD_ID);
    const channel = await guild.channels.fetch(environment.ROLE_SELECTION_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      throw new Error('ROLE_SELECTION_CHANNEL_ID no apunta a un canal de texto válido.');
    }

    if (environment.AUTO_CREATE_MISSING_ROLES) {
      const result = await roleAssignmentService.syncRoles(guild, true);
      logger.info({ createdRoles: result.created.length, foundRoles: result.found.length }, 'Sincronización automática de roles completada.');
    }

    if (environment.AUTO_PUBLISH_PANEL) {
      const panel = await panelService.ensurePanel(guild);
      logger.info({ panelMessageId: panel.id }, 'Panel de signup publicado o actualizado.');
    }
  } catch (error) {
    logger.error({ err: error }, 'Falló la validación inicial del servidor de Discord.');
  }
});

client.on(Events.MessageCreate, (message) => { void messageHandler.handle(message); });
client.on(Events.InteractionCreate, (interaction) => { void interactionHandler.handle(interaction); });
client.on(Events.GuildMemberRemove, (member) => {
  if (member.guild.id !== environment.DISCORD_GUILD_ID) return;
  void signupService.releaseUser(member.id).then(async (released) => {
    if (released) {
      await panelService.refresh(member.guild);
      logger.info({ userId: member.id, buildNumber: released.buildNumber }, 'Se liberó el puesto de un miembro que abandonó el servidor.');
    }
  }).catch((error: unknown) => {
    logger.error({ err: error, userId: member.id }, 'No se pudo liberar el puesto del miembro.');
  });
});
client.on(Events.Error, (error) => logger.error({ err: error }, 'El cliente de Discord emitió un error.'));

process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Promesa rechazada sin manejar.'));
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Excepción no controlada.');
  process.exitCode = 1;
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  healthState.ready = false;
  clearInterval(syncTimer);
  logger.info({ signal }, 'Cerrando bot, API y conexiones.');
  client.destroy();
  await appServer.close();
  await repository.close();
}

process.once('SIGINT', () => { void shutdown('SIGINT').finally(() => process.exit()); });
process.once('SIGTERM', () => { void shutdown('SIGTERM').finally(() => process.exit()); });

await client.login(environment.DISCORD_TOKEN);
