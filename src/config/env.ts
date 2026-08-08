import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1),
  DISCORD_CLIENT_ID: z.string().trim().regex(/^\d{17,20}$/),
  DISCORD_GUILD_ID: z.string().trim().regex(/^\d{17,20}$/),
  ROLE_SELECTION_CHANNEL_ID: z.string().trim().regex(/^\d{17,20}$/),
  DATABASE_URL: z.string().trim().min(1),
  ADMIN_TOKEN: z.string().trim().min(24),
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  INTERNAL_API_URL: z.url().default('http://127.0.0.1:3000'),
  ALBION_RENDER_BASE_URL: z.url().default('https://render.albiononline.com/v1/item'),
  LEGACY_BUILD_CONFIG_PATH: z.string().trim().min(1).default('config/builds.json'),
  ROLE_REPLACEMENT_ENABLED: booleanFromEnvironment.default(true),
  AUTO_CREATE_MISSING_ROLES: booleanFromEnvironment.default(false),
  AUTO_PUBLISH_PANEL: booleanFromEnvironment.default(true),
  SELECTION_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(60).default(3),
  BUILD_SYNC_SECONDS: z.coerce.number().int().min(5).max(300).default(15),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
