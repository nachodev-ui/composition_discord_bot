import { z } from 'zod';

const booleanFromEnvironment = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().trim().min(1, 'DISCORD_TOKEN es obligatorio.'),
  DISCORD_CLIENT_ID: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, 'DISCORD_CLIENT_ID debe ser un snowflake válido.'),
  DISCORD_GUILD_ID: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, 'DISCORD_GUILD_ID debe ser un snowflake válido.'),
  ROLE_SELECTION_CHANNEL_ID: z
    .string()
    .trim()
    .regex(/^\d{17,20}$/, 'ROLE_SELECTION_CHANNEL_ID debe ser un snowflake válido.'),
  BUILD_CONFIG_PATH: z.string().trim().min(1).default('config/builds.json'),
  SIGNUP_STATE_PATH: z.string().trim().min(1).default('data/signup-state.json'),
  ROLE_REPLACEMENT_ENABLED: booleanFromEnvironment.default(true),
  AUTO_CREATE_MISSING_ROLES: booleanFromEnvironment.default(false),
  AUTO_PUBLISH_PANEL: booleanFromEnvironment.default(true),
  SELECTION_COOLDOWN_SECONDS: z.coerce.number().int().min(0).max(60).default(3),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(source: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(source);
}
