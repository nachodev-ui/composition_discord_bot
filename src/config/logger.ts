import pino from 'pino';

export function createLogger(level: string) {
  return pino({
    level,
    base: undefined,
    redact: {
      paths: ['token', 'DISCORD_TOKEN', '*.token', '*.DISCORD_TOKEN'],
      censor: '[REDACTED]',
    },
  });
}

export type Logger = ReturnType<typeof createLogger>;
