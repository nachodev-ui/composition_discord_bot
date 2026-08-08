import Fastify from 'fastify';
import { z } from 'zod';
import type { Logger } from '../config/logger.js';
import type { AlbionBuild } from '../domain/build.js';
import { buildWriteSchema } from '../domain/build.js';
import { type CompositionRecord, type CompositionWriteInput, PostgresBuildRepository } from '../db/postgresBuildRepository.js';
import { BuildImageGenerator } from '../services/buildImageGenerator.js';
import { renderAdminPage } from './adminPage.js';

export interface HealthState {
  ready: boolean;
  discordUser: string | null;
  startedAt: number;
}

export interface PublishedDiscordMessage {
  guildId: string;
  channelId: string;
  messageId: string;
}

export type BuildPublisher = (build: AlbionBuild, channelId: string | null) => Promise<PublishedDiscordMessage>;
export type CompositionPublisher = (composition: CompositionRecord, channelId: string) => Promise<PublishedDiscordMessage>;

const compositionWriteSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  category: z.string().trim().min(1).max(100).default('General'),
  description: z.string().trim().min(1).nullable().optional(),
  status: z.enum(['draft', 'ready', 'published', 'archived']).default('draft'),
  discordChannelId: z.union([z.string().regex(/^\d{17,20}$/), z.null()]).optional(),
  slots: z.array(z.object({
    position: z.number().int().positive(),
    buildId: z.uuid(),
    label: z.string().trim().min(1).nullable().optional(),
    requiredCount: z.number().int().positive().default(1),
  })).default([]),
});

const publishBodySchema = z.object({
  channelId: z.union([z.string().regex(/^\d{17,20}$/), z.null()]).optional(),
});

function isAuthorized(authorization: string | undefined, adminToken: string): boolean {
  if (!authorization?.startsWith('Bearer ')) return false;
  const token = authorization.slice('Bearer '.length);
  if (token.length !== adminToken.length) return false;
  let mismatch = 0;
  for (let index = 0; index < token.length; index += 1) mismatch |= token.charCodeAt(index) ^ adminToken.charCodeAt(index);
  return mismatch === 0;
}

export interface AppServerOptions {
  port: number;
  adminToken: string;
  publicBaseUrl: string;
  repository: PostgresBuildRepository;
  imageGenerator: BuildImageGenerator;
  getHealthState: () => HealthState;
  logger: Logger;
}

export interface AppServer {
  setBuildPublisher(publisher: BuildPublisher): void;
  setCompositionPublisher(publisher: CompositionPublisher): void;
  setBuildChangeHandler(handler: () => Promise<void>): void;
  close(): Promise<void>;
}

export async function startAppServer(options: AppServerOptions): Promise<AppServer> {
  const app = Fastify({ loggerInstance: options.logger });
  let buildPublisher: BuildPublisher | null = null;
  let compositionPublisher: CompositionPublisher | null = null;
  let onBuildChange: (() => Promise<void>) | null = null;

  app.setErrorHandler((error: unknown, _request, reply) => {
    options.logger.error({ err: error }, 'Error procesando una solicitud HTTP.');
    const statusCode = error instanceof z.ZodError ? 400 : 500;
    const message = error instanceof Error ? error.message : 'Error interno inesperado.';
    void reply.code(statusCode).send({ error: message });
  });

  app.get('/healthz', async () => {
    const state = options.getHealthState();
    return { status: state.ready ? 'ready' : 'starting', discordUser: state.discordUser, uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1_000) };
  });

  app.get('/readyz', async (_request, reply) => {
    const state = options.getHealthState();
    if (!state.ready) return reply.code(503).send({ status: 'starting' });
    return { status: 'ready', discordUser: state.discordUser };
  });

  app.get('/admin', async (_request, reply) => reply.type('text/html; charset=utf-8').send(renderAdminPage()));

  app.get('/api/v1/builds', async () => {
    const builds = await options.repository.listBuilds({ enabledOnly: true });
    return builds.filter((build) => build.status === 'ready' || build.status === 'published');
  });

  app.get('/api/v1/builds/:number', async (request, reply) => {
    const number = Number((request.params as { number: string }).number);
    if (!Number.isInteger(number)) return reply.code(400).send({ error: 'Número inválido.' });
    const build = await options.repository.getBuildByNumber(number);
    if (!build || !build.enabled || build.status === 'draft' || build.status === 'archived') return reply.code(404).send({ error: 'Build no encontrada.' });
    return build;
  });

  app.get('/media/builds/:id.png', async (request, reply) => {
    const { id } = request.params as { id: string };
    const image = await options.repository.getBuildImage(id);
    if (!image) return reply.code(404).send({ error: 'Imagen no encontrada.' });
    return reply.header('content-type', image.contentType).header('cache-control', 'public, max-age=31536000, immutable').header('etag', `"${image.sha256}"`).send(image.data);
  });

  app.addHook('preHandler', async (request, reply) => {
    if (!request.url.startsWith('/api/admin/')) return;
    if (!isAuthorized(request.headers.authorization, options.adminToken)) return reply.code(401).send({ error: 'ADMIN_TOKEN inválido o ausente.' });
  });

  app.get('/api/admin/builds', async () => options.repository.listBuilds({ includeArchived: true }));

  app.post('/api/admin/builds', async (request, reply) => {
    const input = buildWriteSchema.parse(request.body);
    const build = await options.repository.createBuild(input);
    if (onBuildChange) await onBuildChange();
    return reply.code(201).send(build);
  });

  app.put('/api/admin/builds/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = buildWriteSchema.parse(request.body);
    const build = await options.repository.updateBuild(id, input);
    if (!build) return reply.code(404).send({ error: 'Build no encontrada.' });
    if (onBuildChange) await onBuildChange();
    return build;
  });

  app.delete('/api/admin/builds/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await options.repository.archiveBuild(id))) return reply.code(404).send({ error: 'Build no encontrada.' });
    if (onBuildChange) await onBuildChange();
    return reply.code(204).send();
  });

  app.post('/api/admin/builds/:id/generate-image', async (request, reply) => {
    const { id } = request.params as { id: string };
    const build = await options.repository.getBuildById(id);
    if (!build) return reply.code(404).send({ error: 'Build no encontrada.' });
    const image = await options.imageGenerator.generate(build);
    const nextImageVersion = build.imageVersion + 1;
    const publicUrl = `${options.publicBaseUrl.replace(/\/$/u, '')}/media/builds/${id}.png?v=${nextImageVersion}`;
    const updated = await options.repository.saveBuildImage(id, image, publicUrl);
    if (onBuildChange) await onBuildChange();
    return updated;
  });

  app.post('/api/admin/builds/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = publishBodySchema.parse(request.body ?? {});
    const build = await options.repository.getBuildById(id);
    if (!build) return reply.code(404).send({ error: 'Build no encontrada.' });
    if (build.status === 'draft' || build.status === 'archived') return reply.code(409).send({ error: 'La build debe estar Lista o Publicada.' });
    if (!build.imageUrl) return reply.code(409).send({ error: 'Genera la imagen antes de publicar.' });
    if (!buildPublisher) return reply.code(503).send({ error: 'El bot de Discord todavía no está listo.' });

    const published = await buildPublisher(build, body.channelId ?? null);
    await options.repository.recordPublication({ buildId: id, guildId: published.guildId, channelId: published.channelId, messageId: published.messageId, type: 'build' });
    return published;
  });

  app.get('/api/admin/compositions', async () => options.repository.listCompositions());

  app.post('/api/admin/compositions', async (request, reply) => {
    const input: CompositionWriteInput = compositionWriteSchema.parse(request.body);
    const composition = await options.repository.createComposition(input);
    return reply.code(201).send(composition);
  });

  app.put('/api/admin/compositions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const input: CompositionWriteInput = compositionWriteSchema.parse(request.body);
    const composition = await options.repository.updateComposition(id, input);
    if (!composition) return reply.code(404).send({ error: 'Composición no encontrada.' });
    return composition;
  });

  app.delete('/api/admin/compositions/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!(await options.repository.archiveComposition(id))) return reply.code(404).send({ error: 'Composición no encontrada.' });
    return reply.code(204).send();
  });

  app.post('/api/admin/compositions/:id/publish', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = publishBodySchema.parse(request.body ?? {});
    const composition = (await options.repository.listCompositions()).find((candidate) => candidate.id === id);
    if (!composition) return reply.code(404).send({ error: 'Composición no encontrada.' });
    if (composition.status === 'draft' || composition.status === 'archived') return reply.code(409).send({ error: 'La composición debe estar Lista o Publicada.' });
    const channelId = body.channelId ?? composition.discordChannelId;
    if (!channelId) return reply.code(409).send({ error: 'La composición no tiene canal de Discord configurado.' });
    if (!compositionPublisher) return reply.code(503).send({ error: 'El bot de Discord todavía no está listo.' });

    const published = await compositionPublisher(composition, channelId);
    await options.repository.recordPublication({ compositionId: id, guildId: published.guildId, channelId: published.channelId, messageId: published.messageId, type: 'composition' });
    return published;
  });

  await app.listen({ host: '0.0.0.0', port: options.port });
  options.logger.info({ port: options.port }, 'API, panel administrativo y health server iniciados.');

  return {
    setBuildPublisher(nextPublisher) { buildPublisher = nextPublisher; },
    setCompositionPublisher(nextPublisher) { compositionPublisher = nextPublisher; },
    setBuildChangeHandler(handler) { onBuildChange = handler; },
    close: async () => app.close(),
  };
}
