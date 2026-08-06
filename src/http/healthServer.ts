import { createServer, type Server } from 'node:http';
import type { Logger } from '../config/logger.js';

export interface HealthState {
  ready: boolean;
  discordUser: string | null;
  startedAt: number;
}

export function startHealthServer(
  port: number,
  getState: () => HealthState,
  logger: Logger,
): Server {
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || !request.url) {
      response.writeHead(405).end();
      return;
    }

    if (request.url !== '/healthz' && request.url !== '/readyz') {
      response.writeHead(404).end();
      return;
    }

    const state = getState();
    const statusCode = request.url === '/readyz' && !state.ready ? 503 : 200;
    response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
    response.end(
      JSON.stringify({
        status: state.ready ? 'ready' : 'starting',
        discordUser: state.discordUser,
        uptimeSeconds: Math.floor((Date.now() - state.startedAt) / 1_000),
      }),
    );
  });

  server.listen(port, '0.0.0.0', () => {
    logger.info({ port }, 'Servidor de salud iniciado.');
  });

  return server;
}
